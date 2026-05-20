import { Hono, type Context } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { and, desc, eq } from 'drizzle-orm'
import { createDb, type Db } from '../db/client'
import { articles, posts, users } from '../db/schema'
import { authMiddleware, requireRole, type HonoEnv } from '../middleware/auth'
import { articleIdParamSchema, articleSlugParamSchema } from '../lib/schemas'
import {
  errorResponse,
  forbidden,
  notFound,
  payloadTooLarge,
  unsupportedMediaType,
  zodHook,
} from '../lib/http'
import {
  articleCoverUrl,
  buildPostExtras,
  hasCreatorAccess,
  imageExtension,
  IMAGE_TYPES,
  MAX_IMAGE_SIZE,
  toUnixSeconds,
} from '../lib/post-data'
import { notifySubscribersOfContent } from '../lib/notifications'
import { generatePostSlug, serializeReplies } from './posts'

export const articlesRoutes = new Hono<HonoEnv>()

const MAX_TITLE_LENGTH = 140
const MAX_EXCERPT_LENGTH = 280
const MAX_MARKDOWN_LENGTH = 50_000

type ArticleStatus = 'draft' | 'published'

type ParsedArticleForm = {
  title: string
  excerpt: string
  markdown: string
  status: ArticleStatus
  cover: File | null
}

type ArticleRow = {
  postId: string
  slug: string
  body: string
  createdAt: Date | number | null
  authorId: string
  authorDisplayName: string
  authorUsername: string
  authorAvatarUrl: string | null
  title: string
  excerpt: string | null
  markdown: string
  status: ArticleStatus
  coverR2Key: string | null
  coverFileName: string | null
  coverContentType: string | null
  coverSizeBytes: number | null
  publishedAt: Date | number | null
  updatedAt: Date | number | null
}

function markdownExcerpt(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[#>*_`[\]()!-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_EXCERPT_LENGTH)
}

function validateCover(file: File | null) {
  if (!file) return null
  if (!IMAGE_TYPES.includes(file.type as (typeof IMAGE_TYPES)[number])) {
    return { status: 415 as const, message: 'Unsupported cover type. Use JPEG, PNG, or WebP images.' }
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return { status: 413 as const, message: 'Cover image is too large. Maximum size is 5 MB.' }
  }
  return null
}

async function parseArticleForm(c: Context<HonoEnv>): Promise<ParsedArticleForm | Response> {
  const contentType = c.req.header('content-type') ?? ''
  if (!contentType.includes('multipart/form-data')) {
    return errorResponse(c, 415, 'unsupported_media_type', 'Articles must be submitted as multipart/form-data.')
  }

  let formData: FormData
  try {
    formData = await c.req.formData()
  } catch {
    return errorResponse(c, 422, 'validation_failed', 'Invalid multipart/form-data body')
  }

  const title = String(formData.get('title') ?? '').trim()
  const excerpt = String(formData.get('excerpt') ?? '').trim()
  const markdown = String(formData.get('markdown') ?? '').trim()
  const rawStatus = String(formData.get('status') ?? 'draft').trim()
  const coverValue = formData.get('cover')
  const cover = coverValue instanceof File && coverValue.size > 0 ? coverValue : null

  if (rawStatus !== 'draft' && rawStatus !== 'published') {
    return errorResponse(c, 422, 'validation_failed', 'Article status must be draft or published.')
  }

  if (title.length > MAX_TITLE_LENGTH) {
    return errorResponse(c, 422, 'validation_failed', `Title must be ${MAX_TITLE_LENGTH} characters or fewer.`)
  }
  if (excerpt.length > MAX_EXCERPT_LENGTH) {
    return errorResponse(c, 422, 'validation_failed', `Excerpt must be ${MAX_EXCERPT_LENGTH} characters or fewer.`)
  }
  if (markdown.length > MAX_MARKDOWN_LENGTH) {
    return errorResponse(c, 422, 'validation_failed', `Article body must be ${MAX_MARKDOWN_LENGTH} characters or fewer.`)
  }
  if (rawStatus === 'draft' && !title && !markdown) {
    return errorResponse(c, 422, 'validation_failed', 'Drafts need at least a title or article body.')
  }
  if (rawStatus === 'published' && (!title || !markdown)) {
    return errorResponse(c, 422, 'validation_failed', 'Published articles need a title and article body.')
  }

  const coverError = validateCover(cover)
  if (coverError?.status === 415) return unsupportedMediaType(c, coverError.message)
  if (coverError?.status === 413) return payloadTooLarge(c, coverError.message)

  return { title, excerpt, markdown, status: rawStatus, cover }
}

async function uploadCover(c: Context<HonoEnv>, postId: string, file: File) {
  const r2Key = `articles/${postId}/cover-${crypto.randomUUID()}${imageExtension(file.type)}`
  await c.env.MEDIA.put(r2Key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  })
  return {
    coverR2Key: r2Key,
    coverFileName: file.name || 'cover',
    coverContentType: file.type,
    coverSizeBytes: file.size,
  }
}

function serializeArticle(row: ArticleRow, extras?: Awaited<ReturnType<typeof buildPostExtras>>, options?: { includeMarkdown?: boolean }) {
  return {
    id: row.postId,
    postId: row.postId,
    type: 'article' as const,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt || markdownExcerpt(row.markdown),
    markdown: options?.includeMarkdown === false ? '' : row.markdown,
    status: row.status,
    coverUrl: row.coverR2Key ? articleCoverUrl(row.postId) : null,
    createdAt: toUnixSeconds(row.createdAt),
    publishedAt: toUnixSeconds(row.publishedAt),
    updatedAt: toUnixSeconds(row.updatedAt),
    author: {
      id: row.authorId,
      displayName: row.authorDisplayName,
      username: row.authorUsername,
      avatarUrl: row.authorAvatarUrl,
    },
    likeCount: extras?.postLikeCounts.get(row.postId) ?? 0,
    replyCount: extras?.postReplyCounts.get(row.postId) ?? 0,
    viewerLiked: extras?.viewerLikedPostIds.has(row.postId) ?? false,
  }
}

async function getArticleByPostId(db: Db, postId: string) {
  return db
    .select({
      postId: posts.id,
      slug: posts.slug,
      body: posts.body,
      createdAt: posts.createdAt,
      authorId: posts.authorId,
      authorDisplayName: users.displayName,
      authorUsername: users.username,
      authorAvatarUrl: users.avatarUrl,
      title: articles.title,
      excerpt: articles.excerpt,
      markdown: articles.markdown,
      status: articles.status,
      coverR2Key: articles.coverR2Key,
      coverFileName: articles.coverFileName,
      coverContentType: articles.coverContentType,
      coverSizeBytes: articles.coverSizeBytes,
      publishedAt: articles.publishedAt,
      updatedAt: articles.updatedAt,
    })
    .from(articles)
    .innerJoin(posts, eq(posts.id, articles.postId))
    .innerJoin(users, eq(users.id, posts.authorId))
    .where(eq(posts.id, postId))
    .get()
}

async function canReadArticle(db: Db, viewerId: string, article: ArticleRow) {
  if (viewerId === article.authorId) return true
  if (article.status !== 'published') return false
  return hasCreatorAccess(db, viewerId, article.authorId)
}

articlesRoutes.post('/', authMiddleware, requireRole('creator'), async (c) => {
  const parsed = await parseArticleForm(c)
  if (parsed instanceof Response) return parsed

  if (parsed.status === 'published' && !parsed.cover) {
    return errorResponse(c, 422, 'validation_failed', 'Published articles need a cover photo.')
  }

  const db = createDb(c.env.DB)
  const authorId = c.var.user.id
  const postId = crypto.randomUUID()
  const slug = await generatePostSlug(db, authorId, parsed.title || parsed.markdown || 'article')
  const coverFields = parsed.cover ? await uploadCover(c, postId, parsed.cover) : {}
  const now = new Date()
  const excerpt = parsed.excerpt || markdownExcerpt(parsed.markdown)

  await db.insert(posts).values({
    id: postId,
    authorId,
    kind: 'article',
    slug,
    body: excerpt || parsed.title,
  }).run()

  await db.insert(articles).values({
    postId,
    title: parsed.title || 'Untitled article',
    excerpt,
    markdown: parsed.markdown,
    status: parsed.status,
    publishedAt: parsed.status === 'published' ? now : null,
    ...coverFields,
  }).run()

  const article = await getArticleByPostId(db, postId)
  if (parsed.status === 'published' && article) {
    await notifySubscribersOfContent(db, c.env, {
      creatorId: authorId,
      contentType: 'article',
      entityId: postId,
      title: parsed.title || 'Untitled article',
      targetUrl: `/u/${article.authorUsername}/article/${article.slug}`,
    }, new URL(c.req.url).origin)
  }
  return c.json({ article: article ? serializeArticle(article) : null }, 201)
})

articlesRoutes.patch('/:postId', authMiddleware, requireRole('creator'), zValidator('param', articleIdParamSchema, zodHook), async (c) => {
  const { postId } = c.req.valid('param')
  const parsed = await parseArticleForm(c)
  if (parsed instanceof Response) return parsed

  const db = createDb(c.env.DB)
  const existing = await getArticleByPostId(db, postId)
  if (!existing) return notFound(c, 'Article not found')
  if (existing.authorId !== c.var.user.id) return forbidden(c, 'You cannot edit this article')

  if (parsed.status === 'published' && !parsed.cover && !existing.coverR2Key) {
    return errorResponse(c, 422, 'validation_failed', 'Published articles need a cover photo.')
  }

  const coverFields = parsed.cover ? await uploadCover(c, postId, parsed.cover) : {}
  const excerpt = parsed.excerpt || markdownExcerpt(parsed.markdown)
  const publishedAt = parsed.status === 'published'
    ? existing.publishedAt ? new Date(toUnixSeconds(existing.publishedAt)! * 1000) : new Date()
    : null

  await db.update(posts)
    .set({ body: excerpt || parsed.title })
    .where(eq(posts.id, postId))
    .run()

  await db.update(articles)
    .set({
      title: parsed.title || 'Untitled article',
      excerpt,
      markdown: parsed.markdown,
      status: parsed.status,
      publishedAt,
      updatedAt: new Date(),
      ...coverFields,
    })
    .where(eq(articles.postId, postId))
    .run()

  const article = await getArticleByPostId(db, postId)
  if (existing.status !== 'published' && parsed.status === 'published' && article) {
    await notifySubscribersOfContent(db, c.env, {
      creatorId: existing.authorId,
      contentType: 'article',
      entityId: postId,
      title: article.title,
      targetUrl: `/u/${article.authorUsername}/article/${article.slug}`,
    }, new URL(c.req.url).origin)
  }
  return c.json({ article: article ? serializeArticle(article) : null })
})

articlesRoutes.post('/:postId/publish', authMiddleware, requireRole('creator'), zValidator('param', articleIdParamSchema, zodHook), async (c) => {
  const { postId } = c.req.valid('param')
  const db = createDb(c.env.DB)
  const existing = await getArticleByPostId(db, postId)
  if (!existing) return notFound(c, 'Article not found')
  if (existing.authorId !== c.var.user.id) return forbidden(c, 'You cannot publish this article')
  if (!existing.title || !existing.markdown || !existing.coverR2Key) {
    return errorResponse(c, 422, 'validation_failed', 'Published articles need a title, article body, and cover photo.')
  }

  await db.update(articles)
    .set({
      status: 'published',
      publishedAt: existing.publishedAt ? new Date(toUnixSeconds(existing.publishedAt)! * 1000) : new Date(),
      updatedAt: new Date(),
    })
    .where(eq(articles.postId, postId))
    .run()

  const article = await getArticleByPostId(db, postId)
  if (existing.status !== 'published' && article) {
    await notifySubscribersOfContent(db, c.env, {
      creatorId: existing.authorId,
      contentType: 'article',
      entityId: postId,
      title: article.title,
      targetUrl: `/u/${article.authorUsername}/article/${article.slug}`,
    }, new URL(c.req.url).origin)
  }
  return c.json({ article: article ? serializeArticle(article) : null })
})

articlesRoutes.get('/by-slug/:username/:slug', authMiddleware, zValidator('param', articleSlugParamSchema, zodHook), async (c) => {
  const { username, slug } = c.req.valid('param')
  const db = createDb(c.env.DB)
  const article = await db
    .select({
      postId: posts.id,
      slug: posts.slug,
      body: posts.body,
      createdAt: posts.createdAt,
      authorId: posts.authorId,
      authorDisplayName: users.displayName,
      authorUsername: users.username,
      authorAvatarUrl: users.avatarUrl,
      title: articles.title,
      excerpt: articles.excerpt,
      markdown: articles.markdown,
      status: articles.status,
      coverR2Key: articles.coverR2Key,
      coverFileName: articles.coverFileName,
      coverContentType: articles.coverContentType,
      coverSizeBytes: articles.coverSizeBytes,
      publishedAt: articles.publishedAt,
      updatedAt: articles.updatedAt,
    })
    .from(articles)
    .innerJoin(posts, eq(posts.id, articles.postId))
    .innerJoin(users, eq(users.id, posts.authorId))
    .where(and(eq(users.username, username), eq(posts.slug, slug), eq(posts.kind, 'article')))
    .get()

  if (!article) return notFound(c, 'Article not found')
  if (!await canReadArticle(db, c.var.user.id, article)) return forbidden(c, 'You do not have access to this article')

  const [extras, replies] = await Promise.all([
    buildPostExtras(db, c.var.user.id, [article.postId]),
    serializeReplies(db, c.var.user.id, article.postId),
  ])
  return c.json({
    article: serializeArticle(article, extras),
    replies,
  })
})

articlesRoutes.get('/:postId', authMiddleware, zValidator('param', articleIdParamSchema, zodHook), async (c) => {
  const { postId } = c.req.valid('param')
  const db = createDb(c.env.DB)
  const article = await getArticleByPostId(db, postId)

  if (!article) return notFound(c, 'Article not found')
  if (!await canReadArticle(db, c.var.user.id, article)) return forbidden(c, 'You do not have access to this article')

  const [extras, replies] = await Promise.all([
    buildPostExtras(db, c.var.user.id, [article.postId]),
    serializeReplies(db, c.var.user.id, article.postId),
  ])

  return c.json({ article: serializeArticle(article, extras), replies })
})

articlesRoutes.get('/:postId/cover', authMiddleware, zValidator('param', articleIdParamSchema, zodHook), async (c) => {
  const { postId } = c.req.valid('param')
  const db = createDb(c.env.DB)
  const article = await getArticleByPostId(db, postId)
  if (!article?.coverR2Key || !article.coverContentType) return notFound(c, 'Cover not found')
  if (!await canReadArticle(db, c.var.user.id, article)) return forbidden(c, 'You do not have access to this cover')

  const object = await c.env.MEDIA.get(article.coverR2Key)
  if (!object?.body) return notFound(c, 'Cover not found')

  const headers = new Headers()
  headers.set('content-type', article.coverContentType)
  headers.set('cache-control', 'private, max-age=300')
  headers.set('content-disposition', `inline; filename="${encodeURIComponent(article.coverFileName ?? 'cover')}"`)
  headers.set('content-length', String(object.size))

  return new Response(object.body, { headers })
})

export async function listPublishedArticlesForCreator(db: Db, viewerId: string, creatorId: string) {
  const rows = await db
    .select({
      postId: posts.id,
      slug: posts.slug,
      body: posts.body,
      createdAt: posts.createdAt,
      authorId: posts.authorId,
      authorDisplayName: users.displayName,
      authorUsername: users.username,
      authorAvatarUrl: users.avatarUrl,
      title: articles.title,
      excerpt: articles.excerpt,
      markdown: articles.markdown,
      status: articles.status,
      coverR2Key: articles.coverR2Key,
      coverFileName: articles.coverFileName,
      coverContentType: articles.coverContentType,
      coverSizeBytes: articles.coverSizeBytes,
      publishedAt: articles.publishedAt,
      updatedAt: articles.updatedAt,
    })
    .from(articles)
    .innerJoin(posts, eq(posts.id, articles.postId))
    .innerJoin(users, eq(users.id, posts.authorId))
    .where(and(eq(posts.authorId, creatorId), eq(articles.status, 'published')))
    .orderBy(desc(articles.publishedAt))
    .limit(50)
    .all()

  const extras = await buildPostExtras(db, viewerId, rows.map((row) => row.postId))
  return rows.map((row) => serializeArticle(row, extras, { includeMarkdown: false }))
}
