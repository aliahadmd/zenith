import { Hono, type Context } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { and, eq, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { createDb, type Db } from '../db/client'
import {
  audioItems,
  articles,
  pollOptions,
  pollVotes,
  postAttachments,
  postLikes,
  postPolls,
  postReplies,
  posts,
  replyAttachments,
  replyLikes,
  users,
} from '../db/schema'
import { authMiddleware, requireRole, type HonoEnv } from '../middleware/auth'
import {
  attachmentIdParamSchema,
  pollIdParamSchema,
  pollVoteSchema,
  postCreateSchema,
  postIdParamSchema,
  postSlugParamSchema,
  replyCreateJsonSchema,
  replyIdParamSchema,
} from '../lib/schemas'
import {
  errorResponse,
  forbidden,
  notFound,
  payloadTooLarge,
  unsupportedMediaType,
  zodHook,
} from '../lib/http'
import {
  buildPostExtras,
  buildReplyAttachments,
  buildReplyLikeState,
  hasCreatorAccess,
  imageExtension,
  IMAGE_TYPES,
  MAX_IMAGE_SIZE,
  MAX_IMAGES,
  toUnixSeconds,
} from '../lib/post-data'

export const postsRoutes = new Hono<HonoEnv>()
export const repliesRoutes = new Hono<HonoEnv>()
export const pollsRoutes = new Hono<HonoEnv>()
export const mediaRoutes = new Hono<HonoEnv>()

type PollInput = {
  question: string
  options: string[]
}

type PostRow = {
  id: string
  kind: 'post' | 'article' | 'audio'
  slug: string
  body: string
  createdAt: Date | number | null
  authorId: string
  authorDisplayName: string
  authorUsername: string
  authorAvatarUrl: string | null
  articleStatus?: 'draft' | 'published' | null
  audioStatus?: 'draft' | 'published' | null
}

const replyAuthors = alias(users, 'reply_authors')
const mentionedUsers = alias(users, 'mentioned_users')

export function slugify(input: string) {
  const slug = input
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)

  return slug || 'post'
}

export async function generatePostSlug(db: Db, authorId: string, seed: string) {
  const base = slugify(seed)

  for (let index = 0; index < 25; index += 1) {
    const candidate = index === 0 ? base : `${base}-${index + 1}`
    const existing = await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.authorId, authorId), eq(posts.slug, candidate)))
      .get()

    if (!existing) return candidate
  }

  return `${base}-${crypto.randomUUID().slice(0, 8)}`
}

function getFiles(formData: FormData) {
  return formData.getAll('images').filter((value): value is File => value instanceof File && value.size > 0)
}

function validateImageFiles(files: File[]) {
  if (files.length > MAX_IMAGES) {
    return { status: 422 as const, message: `Upload ${MAX_IMAGES} images or fewer.` }
  }

  for (const file of files) {
    if (!IMAGE_TYPES.includes(file.type as (typeof IMAGE_TYPES)[number])) {
      return { status: 415 as const, message: 'Unsupported media type. Use JPEG, PNG, or WebP images.' }
    }
    if (file.size > MAX_IMAGE_SIZE) {
      return { status: 413 as const, message: 'Image is too large. Maximum size is 5 MB.' }
    }
  }

  return null
}

function parsePoll(formData: FormData): PollInput | null | { error: string } {
  const question = String(formData.get('pollQuestion') ?? '').trim()
  const rawOptions = formData.get('pollOptions')

  if (!question && !rawOptions) return null
  if (!question) return { error: 'Poll question is required.' }

  let options: string[]
  try {
    options = typeof rawOptions === 'string' ? JSON.parse(rawOptions) : []
  } catch {
    return { error: 'Poll options must be valid JSON.' }
  }

  const cleanOptions = options
    .filter((option): option is string => typeof option === 'string')
    .map((option) => option.trim())
    .filter(Boolean)

  if (cleanOptions.length < 2 || cleanOptions.length > 4) {
    return { error: 'Polls must include 2 to 4 options.' }
  }

  if (question.length > 140 || cleanOptions.some((option) => option.length > 80)) {
    return { error: 'Poll question or options are too long.' }
  }

  return { question, options: cleanOptions }
}

async function uploadPostAttachments(c: Context<HonoEnv>, postId: string, uploaderId: string, files: File[]) {
  const db = createDb(c.env.DB)

  for (const [index, file] of files.entries()) {
    const id = crypto.randomUUID()
    const r2Key = `posts/${postId}/${id}${imageExtension(file.type)}`

    await c.env.MEDIA.put(r2Key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type },
    })

    await db.insert(postAttachments).values({
      id,
      postId,
      uploaderId,
      r2Key,
      fileName: file.name || `image-${index + 1}`,
      contentType: file.type,
      sizeBytes: file.size,
      displayOrder: index,
    }).run()
  }
}

async function uploadReplyAttachments(c: Context<HonoEnv>, replyId: string, uploaderId: string, files: File[]) {
  const db = createDb(c.env.DB)

  for (const [index, file] of files.entries()) {
    const id = crypto.randomUUID()
    const r2Key = `replies/${replyId}/${id}${imageExtension(file.type)}`

    await c.env.MEDIA.put(r2Key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type },
    })

    await db.insert(replyAttachments).values({
      id,
      replyId,
      uploaderId,
      r2Key,
      fileName: file.name || `image-${index + 1}`,
      contentType: file.type,
      sizeBytes: file.size,
      displayOrder: index,
    }).run()
  }
}

async function getPostRowById(db: Db, postId: string) {
  return db
    .select({
      id: posts.id,
      kind: posts.kind,
      slug: posts.slug,
      body: posts.body,
      createdAt: posts.createdAt,
      authorId: posts.authorId,
      authorDisplayName: users.displayName,
      authorUsername: users.username,
      authorAvatarUrl: users.avatarUrl,
      articleStatus: articles.status,
      audioStatus: audioItems.status,
    })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.authorId))
    .leftJoin(articles, eq(articles.postId, posts.id))
    .leftJoin(audioItems, eq(audioItems.postId, posts.id))
    .where(eq(posts.id, postId))
    .get()
}

async function getAccessiblePostById(db: Db, viewerId: string, postId: string) {
  const post = await getPostRowById(db, postId)
  if (!post) return { post: null, allowed: false }
  if (post.kind === 'article' && post.articleStatus !== 'published' && viewerId !== post.authorId) {
    return { post, allowed: false }
  }
  if (post.kind === 'audio' && post.audioStatus !== 'published' && viewerId !== post.authorId) {
    return { post, allowed: false }
  }
  return { post, allowed: await hasCreatorAccess(db, viewerId, post.authorId) }
}

function serializePost(post: PostRow, extras: Awaited<ReturnType<typeof buildPostExtras>>) {
  return {
    id: post.id,
    type: post.kind,
    slug: post.slug,
    body: post.body,
    createdAt: toUnixSeconds(post.createdAt),
    author: {
      id: post.authorId,
      displayName: post.authorDisplayName,
      username: post.authorUsername,
      avatarUrl: post.authorAvatarUrl,
    },
    attachments: extras.attachmentsByPostId.get(post.id) ?? [],
    likeCount: extras.postLikeCounts.get(post.id) ?? 0,
    replyCount: extras.postReplyCounts.get(post.id) ?? 0,
    viewerLiked: extras.viewerLikedPostIds.has(post.id),
    poll: extras.pollsByPostId.get(post.id) ?? null,
  }
}

export async function serializeReplies(db: Db, viewerId: string, postId: string) {
  const replies = await db
    .select({
      id: postReplies.id,
      postId: postReplies.postId,
      parentReplyId: postReplies.parentReplyId,
      mentionedUserId: postReplies.mentionedUserId,
      body: postReplies.body,
      createdAt: postReplies.createdAt,
      authorId: postReplies.authorId,
      authorDisplayName: replyAuthors.displayName,
      authorUsername: replyAuthors.username,
      authorAvatarUrl: replyAuthors.avatarUrl,
      mentionedUsername: mentionedUsers.username,
      mentionedDisplayName: mentionedUsers.displayName,
    })
    .from(postReplies)
    .innerJoin(replyAuthors, eq(replyAuthors.id, postReplies.authorId))
    .leftJoin(mentionedUsers, eq(mentionedUsers.id, postReplies.mentionedUserId))
    .where(eq(postReplies.postId, postId))
    .orderBy(postReplies.createdAt)
    .all()

  const replyIds = replies.map((reply) => reply.id)
  const [attachmentsByReplyId, likeState] = await Promise.all([
    buildReplyAttachments(db, replyIds),
    buildReplyLikeState(db, viewerId, replyIds),
  ])

  return replies.map((reply) => ({
    id: reply.id,
    postId: reply.postId,
    parentReplyId: reply.parentReplyId,
    body: reply.body,
    createdAt: toUnixSeconds(reply.createdAt),
    author: {
      id: reply.authorId,
      displayName: reply.authorDisplayName,
      username: reply.authorUsername,
      avatarUrl: reply.authorAvatarUrl,
    },
    mentionedUser: reply.mentionedUserId
      ? {
          id: reply.mentionedUserId,
          displayName: reply.mentionedDisplayName,
          username: reply.mentionedUsername,
        }
      : null,
    attachments: attachmentsByReplyId.get(reply.id) ?? [],
    likeCount: likeState.counts.get(reply.id) ?? 0,
    viewerLiked: likeState.viewerLikedIds.has(reply.id),
  }))
}

async function postLikeState(db: Db, viewerId: string, postId: string) {
  const [countRow, liked] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(postLikes).where(eq(postLikes.postId, postId)).get(),
    db
      .select({ postId: postLikes.postId })
      .from(postLikes)
      .where(and(eq(postLikes.postId, postId), eq(postLikes.userId, viewerId)))
      .get(),
  ])

  return { likeCount: Number(countRow?.count ?? 0), viewerLiked: Boolean(liked) }
}

async function replyLikeState(db: Db, viewerId: string, replyId: string) {
  const [countRow, liked] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(replyLikes).where(eq(replyLikes.replyId, replyId)).get(),
    db
      .select({ replyId: replyLikes.replyId })
      .from(replyLikes)
      .where(and(eq(replyLikes.replyId, replyId), eq(replyLikes.userId, viewerId)))
      .get(),
  ])

  return { likeCount: Number(countRow?.count ?? 0), viewerLiked: Boolean(liked) }
}

// ── POST /api/posts ────────────────────────────────────────────────────────

postsRoutes.post('/', authMiddleware, requireRole('creator'), async (c) => {
  const db = createDb(c.env.DB)
  const authorId = c.var.user.id
  const contentType = c.req.header('content-type') ?? ''
  let body = ''
  let images: File[] = []
  let poll: PollInput | null = null

  if (contentType.includes('multipart/form-data')) {
    let formData: FormData
    try {
      formData = await c.req.formData()
    } catch {
      return errorResponse(c, 422, 'validation_failed', 'Invalid multipart/form-data body')
    }

    body = String(formData.get('body') ?? '').trim()
    if (body.length > 500) {
      return errorResponse(c, 422, 'validation_failed', 'Post body must be 500 characters or fewer.')
    }

    images = getFiles(formData)
    const imageError = validateImageFiles(images)
    if (imageError?.status === 415) return unsupportedMediaType(c, imageError.message)
    if (imageError?.status === 413) return payloadTooLarge(c, imageError.message)
    if (imageError) return errorResponse(c, 422, 'validation_failed', imageError.message)

    const parsedPoll = parsePoll(formData)
    if (parsedPoll && 'error' in parsedPoll) {
      return errorResponse(c, 422, 'validation_failed', parsedPoll.error)
    }
    poll = parsedPoll

    if (!body && images.length === 0 && !poll) {
      return errorResponse(c, 422, 'validation_failed', 'Add post text, images, or a poll.')
    }
  } else {
    const parsed = postCreateSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return errorResponse(c, 422, 'validation_failed', 'Validation failed', { issues: parsed.error.issues })
    body = parsed.data.body
  }

  const id = crypto.randomUUID()
  const slug = await generatePostSlug(db, authorId, body || poll?.question || 'post')

  const inserted = await db
    .insert(posts)
    .values({ id, authorId, slug, body })
    .returning({
      id: posts.id,
      slug: posts.slug,
      body: posts.body,
      createdAt: posts.createdAt,
    })
    .get()

  if (images.length > 0) {
    await uploadPostAttachments(c, id, authorId, images)
  }

  if (poll) {
    const pollId = crypto.randomUUID()
    await db.insert(postPolls).values({ id: pollId, postId: id, question: poll.question }).run()
    for (const [index, option] of poll.options.entries()) {
      await db.insert(pollOptions).values({
        id: crypto.randomUUID(),
        pollId,
        text: option,
        position: index,
      }).run()
    }
  }

  return c.json(
    {
      id: inserted.id,
      slug: inserted.slug,
      body: inserted.body,
      createdAt: toUnixSeconds(inserted.createdAt),
    },
    201,
  )
})

// ── GET /api/posts/by-slug/:username/:slug ────────────────────────────────

postsRoutes.get('/by-slug/:username/:slug', authMiddleware, zValidator('param', postSlugParamSchema, zodHook), async (c) => {
  const { username, slug } = c.req.valid('param')
  const db = createDb(c.env.DB)

  const post = await db
    .select({
      id: posts.id,
      kind: posts.kind,
      slug: posts.slug,
      body: posts.body,
      createdAt: posts.createdAt,
      authorId: posts.authorId,
      authorDisplayName: users.displayName,
      authorUsername: users.username,
      authorAvatarUrl: users.avatarUrl,
    })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.authorId))
    .where(and(eq(users.username, username), eq(posts.slug, slug), eq(posts.kind, 'post')))
    .get()

  if (!post) return notFound(c, 'Post not found')
  if (!await hasCreatorAccess(db, c.var.user.id, post.authorId)) return forbidden(c, 'You do not have access to this post')

  const [extras, replies] = await Promise.all([
    buildPostExtras(db, c.var.user.id, [post.id]),
    serializeReplies(db, c.var.user.id, post.id),
  ])

  return c.json({ post: serializePost(post, extras), replies })
})

// ── GET /api/posts/:postId/replies ────────────────────────────────────────

postsRoutes.get('/:postId/replies', authMiddleware, zValidator('param', postIdParamSchema, zodHook), async (c) => {
  const { postId } = c.req.valid('param')
  const db = createDb(c.env.DB)
  const { post, allowed } = await getAccessiblePostById(db, c.var.user.id, postId)

  if (!post) return notFound(c, 'Post not found')
  if (!allowed) return forbidden(c, 'You do not have access to this post')

  return c.json({ replies: await serializeReplies(db, c.var.user.id, postId) })
})

// ── POST /api/posts/:postId/replies ───────────────────────────────────────

postsRoutes.post('/:postId/replies', authMiddleware, zValidator('param', postIdParamSchema, zodHook), async (c) => {
  const { postId } = c.req.valid('param')
  const db = createDb(c.env.DB)
  const { post, allowed } = await getAccessiblePostById(db, c.var.user.id, postId)

  if (!post) return notFound(c, 'Post not found')
  if (!allowed) return forbidden(c, 'You do not have access to this post')

  const contentType = c.req.header('content-type') ?? ''
  let body = ''
  let parentReplyId: string | undefined
  let images: File[] = []

  if (contentType.includes('multipart/form-data')) {
    let formData: FormData
    try {
      formData = await c.req.formData()
    } catch {
      return errorResponse(c, 422, 'validation_failed', 'Invalid multipart/form-data body')
    }

    body = String(formData.get('body') ?? '').trim()
    parentReplyId = String(formData.get('parentReplyId') ?? '').trim() || undefined

    if (body.length < 1 || body.length > 500) {
      return errorResponse(c, 422, 'validation_failed', 'Reply body must be between 1 and 500 characters.')
    }

    images = getFiles(formData)
    const imageError = validateImageFiles(images)
    if (imageError?.status === 415) return unsupportedMediaType(c, imageError.message)
    if (imageError?.status === 413) return payloadTooLarge(c, imageError.message)
    if (imageError) return errorResponse(c, 422, 'validation_failed', imageError.message)
  } else {
    const parsed = replyCreateJsonSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return errorResponse(c, 422, 'validation_failed', 'Validation failed', { issues: parsed.error.issues })
    body = parsed.data.body
    parentReplyId = parsed.data.parentReplyId
  }

  let mentionedUserId = post.authorId

  if (parentReplyId) {
    const parentReply = await db
      .select({ id: postReplies.id, postId: postReplies.postId, authorId: postReplies.authorId })
      .from(postReplies)
      .where(eq(postReplies.id, parentReplyId))
      .get()

    if (!parentReply || parentReply.postId !== postId) return notFound(c, 'Parent reply not found')
    mentionedUserId = parentReply.authorId
  }

  const replyId = crypto.randomUUID()
  await db.insert(postReplies).values({
    id: replyId,
    postId,
    authorId: c.var.user.id,
    parentReplyId: parentReplyId ?? null,
    mentionedUserId,
    body,
  }).run()

  if (images.length > 0) {
    await uploadReplyAttachments(c, replyId, c.var.user.id, images)
  }

  const replies = await serializeReplies(db, c.var.user.id, postId)
  const reply = replies.find((candidate) => candidate.id === replyId)

  return c.json({ reply }, 201)
})

// ── POST/DELETE /api/posts/:postId/like ───────────────────────────────────

postsRoutes.post('/:postId/like', authMiddleware, zValidator('param', postIdParamSchema, zodHook), async (c) => {
  const { postId } = c.req.valid('param')
  const db = createDb(c.env.DB)
  const { post, allowed } = await getAccessiblePostById(db, c.var.user.id, postId)

  if (!post) return notFound(c, 'Post not found')
  if (!allowed) return forbidden(c, 'You do not have access to this post')

  await db.insert(postLikes).values({ postId, userId: c.var.user.id }).onConflictDoNothing().run()
  return c.json(await postLikeState(db, c.var.user.id, postId))
})

postsRoutes.delete('/:postId/like', authMiddleware, zValidator('param', postIdParamSchema, zodHook), async (c) => {
  const { postId } = c.req.valid('param')
  const db = createDb(c.env.DB)
  const { post, allowed } = await getAccessiblePostById(db, c.var.user.id, postId)

  if (!post) return notFound(c, 'Post not found')
  if (!allowed) return forbidden(c, 'You do not have access to this post')

  await db.delete(postLikes).where(and(eq(postLikes.postId, postId), eq(postLikes.userId, c.var.user.id))).run()
  return c.json(await postLikeState(db, c.var.user.id, postId))
})

// ── POST/DELETE /api/replies/:replyId/like ────────────────────────────────

repliesRoutes.post('/:replyId/like', authMiddleware, zValidator('param', replyIdParamSchema, zodHook), async (c) => {
  const { replyId } = c.req.valid('param')
  const db = createDb(c.env.DB)
  const reply = await db.select({ postId: postReplies.postId }).from(postReplies).where(eq(postReplies.id, replyId)).get()

  if (!reply) return notFound(c, 'Reply not found')
  const { post, allowed } = await getAccessiblePostById(db, c.var.user.id, reply.postId)
  if (!post) return notFound(c, 'Post not found')
  if (!allowed) return forbidden(c, 'You do not have access to this reply')

  await db.insert(replyLikes).values({ replyId, userId: c.var.user.id }).onConflictDoNothing().run()
  return c.json(await replyLikeState(db, c.var.user.id, replyId))
})

repliesRoutes.delete('/:replyId/like', authMiddleware, zValidator('param', replyIdParamSchema, zodHook), async (c) => {
  const { replyId } = c.req.valid('param')
  const db = createDb(c.env.DB)
  const reply = await db.select({ postId: postReplies.postId }).from(postReplies).where(eq(postReplies.id, replyId)).get()

  if (!reply) return notFound(c, 'Reply not found')
  const { post, allowed } = await getAccessiblePostById(db, c.var.user.id, reply.postId)
  if (!post) return notFound(c, 'Post not found')
  if (!allowed) return forbidden(c, 'You do not have access to this reply')

  await db.delete(replyLikes).where(and(eq(replyLikes.replyId, replyId), eq(replyLikes.userId, c.var.user.id))).run()
  return c.json(await replyLikeState(db, c.var.user.id, replyId))
})

// ── POST /api/polls/:pollId/vote ──────────────────────────────────────────

pollsRoutes.post('/:pollId/vote', authMiddleware, zValidator('param', pollIdParamSchema, zodHook), zValidator('json', pollVoteSchema, zodHook), async (c) => {
  const { pollId } = c.req.valid('param')
  const { optionId } = c.req.valid('json')
  const db = createDb(c.env.DB)

  const poll = await db
    .select({ id: postPolls.id, postId: postPolls.postId, authorId: posts.authorId })
    .from(postPolls)
    .innerJoin(posts, eq(posts.id, postPolls.postId))
    .where(eq(postPolls.id, pollId))
    .get()

  if (!poll) return notFound(c, 'Poll not found')
  if (!await hasCreatorAccess(db, c.var.user.id, poll.authorId)) return forbidden(c, 'You do not have access to this poll')

  const option = await db
    .select({ id: pollOptions.id })
    .from(pollOptions)
    .where(and(eq(pollOptions.id, optionId), eq(pollOptions.pollId, pollId)))
    .get()

  if (!option) return notFound(c, 'Poll option not found')

  await db
    .insert(pollVotes)
    .values({ pollId, userId: c.var.user.id, optionId })
    .onConflictDoUpdate({
      target: [pollVotes.pollId, pollVotes.userId],
      set: { optionId, updatedAt: new Date() },
    })
    .run()

  const extras = await buildPostExtras(db, c.var.user.id, [poll.postId])
  return c.json({ poll: extras.pollsByPostId.get(poll.postId) })
})

// ── GET /api/media/:attachmentId ──────────────────────────────────────────

mediaRoutes.get('/:attachmentId', authMiddleware, zValidator('param', attachmentIdParamSchema, zodHook), async (c) => {
  const { attachmentId } = c.req.valid('param')
  const db = createDb(c.env.DB)

  const postAttachment = await db
    .select({
      id: postAttachments.id,
      r2Key: postAttachments.r2Key,
      fileName: postAttachments.fileName,
      contentType: postAttachments.contentType,
      authorId: posts.authorId,
    })
    .from(postAttachments)
    .innerJoin(posts, eq(posts.id, postAttachments.postId))
    .where(eq(postAttachments.id, attachmentId))
    .get()

  const attachment = postAttachment ?? await db
    .select({
      id: replyAttachments.id,
      r2Key: replyAttachments.r2Key,
      fileName: replyAttachments.fileName,
      contentType: replyAttachments.contentType,
      authorId: posts.authorId,
    })
    .from(replyAttachments)
    .innerJoin(postReplies, eq(postReplies.id, replyAttachments.replyId))
    .innerJoin(posts, eq(posts.id, postReplies.postId))
    .where(eq(replyAttachments.id, attachmentId))
    .get()

  if (!attachment) return notFound(c, 'Media not found')
  if (!await hasCreatorAccess(db, c.var.user.id, attachment.authorId)) return forbidden(c, 'You do not have access to this media')

  const object = await c.env.MEDIA.get(attachment.r2Key)
  if (!object?.body) return notFound(c, 'Media not found')

  const headers = new Headers()
  headers.set('content-type', attachment.contentType)
  headers.set('cache-control', 'private, max-age=300')
  headers.set('content-disposition', `inline; filename="${encodeURIComponent(attachment.fileName)}"`)
  headers.set('content-length', String(object.size))

  return new Response(object.body, { headers })
})
