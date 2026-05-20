import { Hono, type Context } from 'hono'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { createDb, type Db } from '../db/client'
import { audioCollections, audioItems, posts, users } from '../db/schema'
import { authMiddleware, requireRole, type HonoEnv } from '../middleware/auth'
import {
  errorResponse,
  forbidden,
  notFound,
  payloadTooLarge,
  unsupportedMediaType,
} from '../lib/http'
import {
  audioCollectionCoverUrl,
  audioExtension,
  audioItemCoverUrl,
  audioStreamUrl,
  AUDIO_TYPES,
  buildPostExtras,
  hasCreatorAccess,
  imageExtension,
  IMAGE_TYPES,
  MAX_AUDIO_SIZE,
  MAX_IMAGE_SIZE,
  toUnixSeconds,
} from '../lib/post-data'
import { notifySubscribersOfContent } from '../lib/notifications'
import { generatePostSlug, serializeReplies, slugify } from './posts'

export const audioRoutes = new Hono<HonoEnv>()

type AudioCollectionKind = 'album' | 'podcast'
type AudioItemKind = 'music' | 'podcast_episode'
type PublishStatus = 'draft' | 'published'

type ParsedCollectionForm = {
  kind: AudioCollectionKind
  title: string
  description: string
  status: PublishStatus
  releaseDate: Date | null
  cover: File | null
}

type ParsedItemForm = {
  collectionId: string
  title: string
  description: string
  status: PublishStatus
  durationSeconds: number | null
  audio: File | null
  cover: File | null
}

type AudioCollectionRow = {
  id: string
  creatorId: string
  creatorDisplayName: string
  creatorUsername: string
  creatorAvatarUrl: string | null
  kind: AudioCollectionKind
  slug: string
  title: string
  description: string | null
  status: PublishStatus
  coverR2Key: string | null
  coverFileName: string | null
  coverContentType: string | null
  coverSizeBytes: number | null
  releaseDate: Date | number | null
  createdAt: Date | number | null
  updatedAt: Date | number | null
}

type AudioItemRow = {
  id: string
  collectionId: string
  postId: string
  creatorId: string
  creatorDisplayName: string
  creatorUsername: string
  creatorAvatarUrl: string | null
  collectionKind: AudioCollectionKind
  collectionSlug: string
  collectionTitle: string
  collectionStatus: PublishStatus
  collectionCoverR2Key: string | null
  collectionCoverContentType: string | null
  kind: AudioItemKind
  slug: string
  title: string
  description: string | null
  status: PublishStatus
  audioR2Key: string | null
  audioFileName: string | null
  audioContentType: string | null
  audioSizeBytes: number | null
  coverR2Key: string | null
  coverFileName: string | null
  coverContentType: string | null
  coverSizeBytes: number | null
  durationSeconds: number | null
  displayOrder: number
  publishedAt: Date | number | null
  createdAt: Date | number | null
  updatedAt: Date | number | null
}

const collectionCreators = alias(users, 'audio_collection_creators')
const itemCreators = alias(users, 'audio_item_creators')

function parseOptionalDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null
  const date = new Date(`${value.trim()}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

function parsePositiveInteger(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null
}

function fileFromFormData(formData: FormData, key: string) {
  const value = formData.get(key)
  return value instanceof File && value.size > 0 ? value : null
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

function validateAudio(file: File | null) {
  if (!file) return null
  if (!AUDIO_TYPES.includes(file.type as (typeof AUDIO_TYPES)[number])) {
    return { status: 415 as const, message: 'Unsupported audio type. Use MP3, M4A, WAV, OGG, or WebM.' }
  }
  if (file.size > MAX_AUDIO_SIZE) {
    return { status: 413 as const, message: 'Audio file is too large. Maximum size is 90 MB.' }
  }
  return null
}

async function readForm(c: Context<HonoEnv>) {
  const contentType = c.req.header('content-type') ?? ''
  if (!contentType.includes('multipart/form-data')) {
    return errorResponse(c, 415, 'unsupported_media_type', 'Audio forms must be submitted as multipart/form-data.')
  }

  try {
    return await c.req.formData()
  } catch {
    return errorResponse(c, 422, 'validation_failed', 'Invalid multipart/form-data body')
  }
}

async function parseCollectionForm(c: Context<HonoEnv>): Promise<ParsedCollectionForm | Response> {
  const formData = await readForm(c)
  if (formData instanceof Response) return formData

  const rawKind = String(formData.get('kind') ?? '').trim()
  const title = String(formData.get('title') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const rawStatus = String(formData.get('status') ?? 'draft').trim()
  const cover = fileFromFormData(formData, 'cover')

  if (rawKind !== 'album' && rawKind !== 'podcast') {
    return errorResponse(c, 422, 'validation_failed', 'Collection kind must be album or podcast.')
  }
  if (rawStatus !== 'draft' && rawStatus !== 'published') {
    return errorResponse(c, 422, 'validation_failed', 'Status must be draft or published.')
  }
  if (!title || title.length > 140) {
    return errorResponse(c, 422, 'validation_failed', 'Title is required and must be 140 characters or fewer.')
  }
  if (description.length > 1_000) {
    return errorResponse(c, 422, 'validation_failed', 'Description must be 1,000 characters or fewer.')
  }

  const coverError = validateCover(cover)
  if (coverError?.status === 415) return unsupportedMediaType(c, coverError.message)
  if (coverError?.status === 413) return payloadTooLarge(c, coverError.message)

  return {
    kind: rawKind,
    title,
    description,
    status: rawStatus,
    releaseDate: parseOptionalDate(formData.get('releaseDate')),
    cover,
  }
}

async function parseItemForm(c: Context<HonoEnv>): Promise<ParsedItemForm | Response> {
  const formData = await readForm(c)
  if (formData instanceof Response) return formData

  const collectionId = String(formData.get('collectionId') ?? '').trim()
  const title = String(formData.get('title') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const rawStatus = String(formData.get('status') ?? 'draft').trim()
  const audio = fileFromFormData(formData, 'audio')
  const cover = fileFromFormData(formData, 'cover')

  if (!collectionId) {
    return errorResponse(c, 422, 'validation_failed', 'Collection is required.')
  }
  if (rawStatus !== 'draft' && rawStatus !== 'published') {
    return errorResponse(c, 422, 'validation_failed', 'Status must be draft or published.')
  }
  if (!title || title.length > 160) {
    return errorResponse(c, 422, 'validation_failed', 'Title is required and must be 160 characters or fewer.')
  }
  if (description.length > 1_000) {
    return errorResponse(c, 422, 'validation_failed', 'Description must be 1,000 characters or fewer.')
  }

  const audioError = validateAudio(audio)
  if (audioError?.status === 415) return unsupportedMediaType(c, audioError.message)
  if (audioError?.status === 413) return payloadTooLarge(c, audioError.message)
  const coverError = validateCover(cover)
  if (coverError?.status === 415) return unsupportedMediaType(c, coverError.message)
  if (coverError?.status === 413) return payloadTooLarge(c, coverError.message)

  return {
    collectionId,
    title,
    description,
    status: rawStatus,
    durationSeconds: parsePositiveInteger(formData.get('durationSeconds')),
    audio,
    cover,
  }
}

async function uploadCollectionCover(c: Context<HonoEnv>, collectionId: string, file: File) {
  const r2Key = `audio/collections/${collectionId}/cover-${crypto.randomUUID()}${imageExtension(file.type)}`
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

async function uploadItemAudio(c: Context<HonoEnv>, itemId: string, file: File) {
  const r2Key = `audio/items/${itemId}/source-${crypto.randomUUID()}${audioExtension(file.type)}`
  await c.env.MEDIA.put(r2Key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  })
  return {
    audioR2Key: r2Key,
    audioFileName: file.name || 'audio',
    audioContentType: file.type,
    audioSizeBytes: file.size,
  }
}

async function uploadItemCover(c: Context<HonoEnv>, itemId: string, file: File) {
  const r2Key = `audio/items/${itemId}/cover-${crypto.randomUUID()}${imageExtension(file.type)}`
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

async function generateCollectionSlug(db: Db, creatorId: string, seed: string) {
  const base = slugify(seed || 'audio')
  for (let index = 0; index < 25; index += 1) {
    const candidate = index === 0 ? base : `${base}-${index + 1}`
    const existing = await db
      .select({ id: audioCollections.id })
      .from(audioCollections)
      .where(and(eq(audioCollections.creatorId, creatorId), eq(audioCollections.slug, candidate)))
      .get()
    if (!existing) return candidate
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`
}

async function generateItemSlug(db: Db, creatorId: string, seed: string) {
  const base = slugify(seed || 'audio')
  for (let index = 0; index < 25; index += 1) {
    const candidate = index === 0 ? base : `${base}-${index + 1}`
    const existing = await db
      .select({ id: audioItems.id })
      .from(audioItems)
      .where(and(eq(audioItems.creatorId, creatorId), eq(audioItems.slug, candidate)))
      .get()
    if (!existing) return candidate
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`
}

function serializeCollection(row: AudioCollectionRow, itemCount = 0) {
  return {
    id: row.id,
    type: 'audio_collection' as const,
    kind: row.kind,
    slug: row.slug,
    title: row.title,
    description: row.description ?? '',
    status: row.status,
    coverUrl: row.coverR2Key ? audioCollectionCoverUrl(row.id) : null,
    releaseDate: toUnixSeconds(row.releaseDate),
    createdAt: toUnixSeconds(row.createdAt),
    updatedAt: toUnixSeconds(row.updatedAt),
    itemCount,
    creator: {
      id: row.creatorId,
      displayName: row.creatorDisplayName,
      username: row.creatorUsername,
      avatarUrl: row.creatorAvatarUrl,
    },
  }
}

function serializeItem(row: AudioItemRow, extras?: Awaited<ReturnType<typeof buildPostExtras>>) {
  const coverUrl = row.coverR2Key
    ? audioItemCoverUrl(row.id)
    : row.collectionCoverR2Key
      ? audioCollectionCoverUrl(row.collectionId)
      : null

  return {
    id: row.id,
    postId: row.postId,
    type: 'audio' as const,
    kind: row.kind,
    slug: row.slug,
    title: row.title,
    description: row.description ?? '',
    status: row.status,
    streamUrl: row.audioR2Key ? audioStreamUrl(row.id) : null,
    coverUrl,
    durationSeconds: row.durationSeconds,
    displayOrder: row.displayOrder,
    createdAt: toUnixSeconds(row.createdAt),
    publishedAt: toUnixSeconds(row.publishedAt),
    updatedAt: toUnixSeconds(row.updatedAt),
    collection: {
      id: row.collectionId,
      kind: row.collectionKind,
      slug: row.collectionSlug,
      title: row.collectionTitle,
      coverUrl: row.collectionCoverR2Key ? audioCollectionCoverUrl(row.collectionId) : null,
    },
    author: {
      id: row.creatorId,
      displayName: row.creatorDisplayName,
      username: row.creatorUsername,
      avatarUrl: row.creatorAvatarUrl,
    },
    likeCount: extras?.postLikeCounts.get(row.postId) ?? 0,
    replyCount: extras?.postReplyCounts.get(row.postId) ?? 0,
    viewerLiked: extras?.viewerLikedPostIds.has(row.postId) ?? false,
  }
}

function collectionSelect() {
  return {
    id: audioCollections.id,
    creatorId: audioCollections.creatorId,
    creatorDisplayName: collectionCreators.displayName,
    creatorUsername: collectionCreators.username,
    creatorAvatarUrl: collectionCreators.avatarUrl,
    kind: audioCollections.kind,
    slug: audioCollections.slug,
    title: audioCollections.title,
    description: audioCollections.description,
    status: audioCollections.status,
    coverR2Key: audioCollections.coverR2Key,
    coverFileName: audioCollections.coverFileName,
    coverContentType: audioCollections.coverContentType,
    coverSizeBytes: audioCollections.coverSizeBytes,
    releaseDate: audioCollections.releaseDate,
    createdAt: audioCollections.createdAt,
    updatedAt: audioCollections.updatedAt,
  }
}

function itemSelect() {
  return {
    id: audioItems.id,
    collectionId: audioItems.collectionId,
    postId: audioItems.postId,
    creatorId: audioItems.creatorId,
    creatorDisplayName: itemCreators.displayName,
    creatorUsername: itemCreators.username,
    creatorAvatarUrl: itemCreators.avatarUrl,
    collectionKind: audioCollections.kind,
    collectionSlug: audioCollections.slug,
    collectionTitle: audioCollections.title,
    collectionStatus: audioCollections.status,
    collectionCoverR2Key: audioCollections.coverR2Key,
    collectionCoverContentType: audioCollections.coverContentType,
    kind: audioItems.kind,
    slug: audioItems.slug,
    title: audioItems.title,
    description: audioItems.description,
    status: audioItems.status,
    audioR2Key: audioItems.audioR2Key,
    audioFileName: audioItems.audioFileName,
    audioContentType: audioItems.audioContentType,
    audioSizeBytes: audioItems.audioSizeBytes,
    coverR2Key: audioItems.coverR2Key,
    coverFileName: audioItems.coverFileName,
    coverContentType: audioItems.coverContentType,
    coverSizeBytes: audioItems.coverSizeBytes,
    durationSeconds: audioItems.durationSeconds,
    displayOrder: audioItems.displayOrder,
    publishedAt: audioItems.publishedAt,
    createdAt: audioItems.createdAt,
    updatedAt: audioItems.updatedAt,
  }
}

async function getCollectionById(db: Db, collectionId: string) {
  return db
    .select(collectionSelect())
    .from(audioCollections)
    .innerJoin(collectionCreators, eq(collectionCreators.id, audioCollections.creatorId))
    .where(eq(audioCollections.id, collectionId))
    .get()
}

async function getItemById(db: Db, itemId: string) {
  return db
    .select(itemSelect())
    .from(audioItems)
    .innerJoin(audioCollections, eq(audioCollections.id, audioItems.collectionId))
    .innerJoin(itemCreators, eq(itemCreators.id, audioItems.creatorId))
    .where(eq(audioItems.id, itemId))
    .get()
}

async function canReadCollection(db: Db, viewerId: string, collection: AudioCollectionRow) {
  if (viewerId === collection.creatorId) return true
  if (collection.status !== 'published') return false
  return hasCreatorAccess(db, viewerId, collection.creatorId)
}

async function canReadItem(db: Db, viewerId: string, item: AudioItemRow) {
  if (viewerId === item.creatorId) return true
  if (item.status !== 'published' || item.collectionStatus !== 'published') return false
  return hasCreatorAccess(db, viewerId, item.creatorId)
}

function audioKindFromCollection(kind: AudioCollectionKind): AudioItemKind {
  return kind === 'album' ? 'music' : 'podcast_episode'
}

audioRoutes.get('/collections/mine', authMiddleware, requireRole('creator'), async (c) => {
  const requestedKind = c.req.query('kind')
  const db = createDb(c.env.DB)
  const kindFilter = requestedKind === 'album' || requestedKind === 'podcast'
    ? eq(audioCollections.kind, requestedKind)
    : undefined
  const where = kindFilter
    ? and(eq(audioCollections.creatorId, c.var.user.id), kindFilter)
    : eq(audioCollections.creatorId, c.var.user.id)

  const rows = await db
    .select(collectionSelect())
    .from(audioCollections)
    .innerJoin(collectionCreators, eq(collectionCreators.id, audioCollections.creatorId))
    .where(where)
    .orderBy(desc(audioCollections.updatedAt))
    .all()

  const itemCounts = rows.length > 0
    ? await db
        .select({ collectionId: audioItems.collectionId, count: sql<number>`count(*)` })
        .from(audioItems)
        .where(inArray(audioItems.collectionId, rows.map((row) => row.id)))
        .groupBy(audioItems.collectionId)
        .all()
    : []
  const countByCollection = new Map(itemCounts.map((row) => [row.collectionId, Number(row.count)]))

  return c.json({ collections: rows.map((row) => serializeCollection(row, countByCollection.get(row.id) ?? 0)) })
})

audioRoutes.post('/collections', authMiddleware, requireRole('creator'), async (c) => {
  const parsed = await parseCollectionForm(c)
  if (parsed instanceof Response) return parsed
  if (parsed.status === 'published' && !parsed.cover) {
    return errorResponse(c, 422, 'validation_failed', 'Published collections need a cover photo.')
  }

  const db = createDb(c.env.DB)
  const id = crypto.randomUUID()
  const slug = await generateCollectionSlug(db, c.var.user.id, parsed.title)
  const coverFields = parsed.cover ? await uploadCollectionCover(c, id, parsed.cover) : {}

  await db.insert(audioCollections).values({
    id,
    creatorId: c.var.user.id,
    kind: parsed.kind,
    slug,
    title: parsed.title,
    description: parsed.description || null,
    status: parsed.status,
    releaseDate: parsed.releaseDate,
    ...coverFields,
  }).run()

  const collection = await getCollectionById(db, id)
  return c.json({ collection: collection ? serializeCollection(collection) : null }, 201)
})

audioRoutes.patch('/collections/:collectionId', authMiddleware, requireRole('creator'), async (c) => {
  const collectionId = c.req.param('collectionId')
  const parsed = await parseCollectionForm(c)
  if (parsed instanceof Response) return parsed

  const db = createDb(c.env.DB)
  const existing = await getCollectionById(db, collectionId)
  if (!existing) return notFound(c, 'Collection not found')
  if (existing.creatorId !== c.var.user.id) return forbidden(c, 'You cannot edit this collection')
  if (parsed.kind !== existing.kind) return errorResponse(c, 422, 'validation_failed', 'Collection kind cannot be changed.')
  if (parsed.status === 'published' && !parsed.cover && !existing.coverR2Key) {
    return errorResponse(c, 422, 'validation_failed', 'Published collections need a cover photo.')
  }

  const coverFields = parsed.cover ? await uploadCollectionCover(c, collectionId, parsed.cover) : {}
  await db.update(audioCollections)
    .set({
      title: parsed.title,
      description: parsed.description || null,
      status: parsed.status,
      releaseDate: parsed.releaseDate,
      updatedAt: new Date(),
      ...coverFields,
    })
    .where(eq(audioCollections.id, collectionId))
    .run()

  const collection = await getCollectionById(db, collectionId)
  return c.json({ collection: collection ? serializeCollection(collection) : null })
})

audioRoutes.delete('/collections/:collectionId', authMiddleware, requireRole('creator'), async (c) => {
  const collectionId = c.req.param('collectionId')
  const db = createDb(c.env.DB)
  const existing = await getCollectionById(db, collectionId)
  if (!existing) return notFound(c, 'Collection not found')
  if (existing.creatorId !== c.var.user.id) return forbidden(c, 'You cannot delete this collection')

  const count = await db
    .select({ count: sql<number>`count(*)` })
    .from(audioItems)
    .where(eq(audioItems.collectionId, collectionId))
    .get()
  if (Number(count?.count ?? 0) > 0) {
    return errorResponse(c, 409, 'collection_not_empty', 'Delete the tracks or episodes before deleting this collection.')
  }

  await db.delete(audioCollections).where(eq(audioCollections.id, collectionId)).run()
  if (existing.coverR2Key) await c.env.MEDIA.delete(existing.coverR2Key)
  return c.json({ ok: true })
})

audioRoutes.post('/items', authMiddleware, requireRole('creator'), async (c) => {
  const parsed = await parseItemForm(c)
  if (parsed instanceof Response) return parsed

  const db = createDb(c.env.DB)
  const collection = await getCollectionById(db, parsed.collectionId)
  if (!collection) return notFound(c, 'Collection not found')
  if (collection.creatorId !== c.var.user.id) return forbidden(c, 'You cannot add audio to this collection')
  if (parsed.status === 'published' && !parsed.audio) {
    return errorResponse(c, 422, 'validation_failed', 'Published audio needs an audio file.')
  }
  if (parsed.status === 'published' && !parsed.cover && !collection.coverR2Key) {
    return errorResponse(c, 422, 'validation_failed', 'Published audio needs an item cover or collection cover.')
  }

  const itemId = crypto.randomUUID()
  const postId = crypto.randomUUID()
  const slug = await generateItemSlug(db, c.var.user.id, parsed.title)
  const postSlug = await generatePostSlug(db, c.var.user.id, parsed.title)
  const [maxOrder] = await db
    .select({ value: sql<number>`coalesce(max(${audioItems.displayOrder}), -1)` })
    .from(audioItems)
    .where(eq(audioItems.collectionId, collection.id))
    .all()
  const audioFields = parsed.audio ? await uploadItemAudio(c, itemId, parsed.audio) : {}
  const coverFields = parsed.cover ? await uploadItemCover(c, itemId, parsed.cover) : {}
  const now = new Date()

  await db.insert(posts).values({
    id: postId,
    authorId: c.var.user.id,
    kind: 'audio',
    slug: postSlug,
    body: parsed.description || parsed.title,
  }).run()

  await db.insert(audioItems).values({
    id: itemId,
    collectionId: collection.id,
    postId,
    creatorId: c.var.user.id,
    kind: audioKindFromCollection(collection.kind),
    slug,
    title: parsed.title,
    description: parsed.description || null,
    status: parsed.status,
    durationSeconds: parsed.durationSeconds,
    displayOrder: Number(maxOrder?.value ?? -1) + 1,
    publishedAt: parsed.status === 'published' ? now : null,
    ...audioFields,
    ...coverFields,
  }).run()

  const item = await getItemById(db, itemId)
  const extras = item ? await buildPostExtras(db, c.var.user.id, [item.postId]) : undefined
  if (parsed.status === 'published' && item) {
    await notifySubscribersOfContent(db, c.env, {
      creatorId: c.var.user.id,
      contentType: 'audio',
      entityId: item.id,
      title: item.title,
      targetUrl: `/u/${item.creatorUsername}/audio/${item.slug}`,
    }, new URL(c.req.url).origin)
  }
  return c.json({ item: item ? serializeItem(item, extras) : null }, 201)
})

audioRoutes.patch('/items/:itemId', authMiddleware, requireRole('creator'), async (c) => {
  const itemId = c.req.param('itemId')
  const parsed = await parseItemForm(c)
  if (parsed instanceof Response) return parsed

  const db = createDb(c.env.DB)
  const existing = await getItemById(db, itemId)
  if (!existing) return notFound(c, 'Audio item not found')
  if (existing.creatorId !== c.var.user.id) return forbidden(c, 'You cannot edit this audio item')
  if (parsed.collectionId !== existing.collectionId) {
    return errorResponse(c, 422, 'validation_failed', 'Moving audio items between collections is not supported in this slice.')
  }
  if (parsed.status === 'published' && !parsed.audio && !existing.audioR2Key) {
    return errorResponse(c, 422, 'validation_failed', 'Published audio needs an audio file.')
  }
  if (parsed.status === 'published' && !parsed.cover && !existing.coverR2Key && !existing.collectionCoverR2Key) {
    return errorResponse(c, 422, 'validation_failed', 'Published audio needs an item cover or collection cover.')
  }

  const audioFields = parsed.audio ? await uploadItemAudio(c, itemId, parsed.audio) : {}
  const coverFields = parsed.cover ? await uploadItemCover(c, itemId, parsed.cover) : {}
  const publishedAt = parsed.status === 'published'
    ? existing.publishedAt ? new Date(toUnixSeconds(existing.publishedAt)! * 1000) : new Date()
    : null

  await db.update(posts)
    .set({ body: parsed.description || parsed.title })
    .where(eq(posts.id, existing.postId))
    .run()

  await db.update(audioItems)
    .set({
      title: parsed.title,
      description: parsed.description || null,
      status: parsed.status,
      durationSeconds: parsed.durationSeconds,
      publishedAt,
      updatedAt: new Date(),
      ...audioFields,
      ...coverFields,
    })
    .where(eq(audioItems.id, itemId))
    .run()

  const item = await getItemById(db, itemId)
  const extras = item ? await buildPostExtras(db, c.var.user.id, [item.postId]) : undefined
  if (existing.status !== 'published' && parsed.status === 'published' && item) {
    await notifySubscribersOfContent(db, c.env, {
      creatorId: c.var.user.id,
      contentType: 'audio',
      entityId: item.id,
      title: item.title,
      targetUrl: `/u/${item.creatorUsername}/audio/${item.slug}`,
    }, new URL(c.req.url).origin)
  }
  return c.json({ item: item ? serializeItem(item, extras) : null })
})

audioRoutes.delete('/items/:itemId', authMiddleware, requireRole('creator'), async (c) => {
  const itemId = c.req.param('itemId')
  const db = createDb(c.env.DB)
  const existing = await getItemById(db, itemId)
  if (!existing) return notFound(c, 'Audio item not found')
  if (existing.creatorId !== c.var.user.id) return forbidden(c, 'You cannot delete this audio item')

  await db.delete(posts).where(eq(posts.id, existing.postId)).run()
  await Promise.all([
    existing.audioR2Key ? c.env.MEDIA.delete(existing.audioR2Key) : Promise.resolve(),
    existing.coverR2Key ? c.env.MEDIA.delete(existing.coverR2Key) : Promise.resolve(),
  ])
  return c.json({ ok: true })
})

audioRoutes.put('/collections/:collectionId/order', authMiddleware, requireRole('creator'), async (c) => {
  const collectionId = c.req.param('collectionId')
  const body = await c.req.json().catch(() => null) as { itemIds?: unknown } | null
  const itemIds = Array.isArray(body?.itemIds) ? body.itemIds.filter((id: unknown): id is string => typeof id === 'string') : []
  if (itemIds.length === 0) {
    return errorResponse(c, 422, 'validation_failed', 'itemIds must include at least one audio item.')
  }

  const db = createDb(c.env.DB)
  const collection = await getCollectionById(db, collectionId)
  if (!collection) return notFound(c, 'Collection not found')
  if (collection.creatorId !== c.var.user.id) return forbidden(c, 'You cannot reorder this collection')

  const existing = await db
    .select({ id: audioItems.id })
    .from(audioItems)
    .where(eq(audioItems.collectionId, collectionId))
    .all()
  const existingIds = new Set(existing.map((item) => item.id))
  const submittedIds = new Set(itemIds)
  if (existingIds.size !== submittedIds.size || itemIds.some((id: string) => !existingIds.has(id))) {
    return errorResponse(c, 422, 'validation_failed', 'Order must include every item in this collection exactly once.')
  }

  for (const [index, id] of itemIds.entries()) {
    await db.update(audioItems).set({ displayOrder: index, updatedAt: new Date() }).where(eq(audioItems.id, id)).run()
  }

  return c.json({ ok: true })
})

audioRoutes.get('/collections/by-slug/:username/:slug', authMiddleware, async (c) => {
  const username = c.req.param('username')
  const slug = c.req.param('slug')
  const db = createDb(c.env.DB)
  const collection = await db
    .select(collectionSelect())
    .from(audioCollections)
    .innerJoin(collectionCreators, eq(collectionCreators.id, audioCollections.creatorId))
    .where(and(eq(collectionCreators.username, username), eq(audioCollections.slug, slug)))
    .get()

  if (!collection) return notFound(c, 'Collection not found')
  if (!await canReadCollection(db, c.var.user.id, collection)) {
    return forbidden(c, 'You do not have access to this audio collection')
  }

  const rows = await db
    .select(itemSelect())
    .from(audioItems)
    .innerJoin(audioCollections, eq(audioCollections.id, audioItems.collectionId))
    .innerJoin(itemCreators, eq(itemCreators.id, audioItems.creatorId))
    .where(and(
      eq(audioItems.collectionId, collection.id),
      c.var.user.id === collection.creatorId ? undefined : eq(audioItems.status, 'published'),
    ))
    .orderBy(asc(audioItems.displayOrder))
    .all()

  const extras = await buildPostExtras(db, c.var.user.id, rows.map((row) => row.postId))
  return c.json({
    collection: serializeCollection(collection, rows.length),
    items: rows.map((row) => serializeItem(row, extras)),
  })
})

audioRoutes.get('/items/by-slug/:username/:slug', authMiddleware, async (c) => {
  const username = c.req.param('username')
  const slug = c.req.param('slug')
  const db = createDb(c.env.DB)
  const item = await db
    .select(itemSelect())
    .from(audioItems)
    .innerJoin(audioCollections, eq(audioCollections.id, audioItems.collectionId))
    .innerJoin(itemCreators, eq(itemCreators.id, audioItems.creatorId))
    .where(and(eq(itemCreators.username, username), eq(audioItems.slug, slug)))
    .get()

  if (!item) return notFound(c, 'Audio not found')
  if (!await canReadItem(db, c.var.user.id, item)) return forbidden(c, 'You do not have access to this audio')

  const [extras, replies] = await Promise.all([
    buildPostExtras(db, c.var.user.id, [item.postId]),
    serializeReplies(db, c.var.user.id, item.postId),
  ])

  return c.json({ item: serializeItem(item, extras), replies })
})

audioRoutes.get('/collections/:collectionId/cover', authMiddleware, async (c) => {
  const collectionId = c.req.param('collectionId')
  const db = createDb(c.env.DB)
  const collection = await getCollectionById(db, collectionId)
  if (!collection?.coverR2Key || !collection.coverContentType) return notFound(c, 'Cover not found')
  if (!await canReadCollection(db, c.var.user.id, collection)) return forbidden(c, 'You do not have access to this cover')

  const object = await c.env.MEDIA.get(collection.coverR2Key)
  if (!object?.body) return notFound(c, 'Cover not found')

  const headers = new Headers()
  headers.set('content-type', collection.coverContentType)
  headers.set('cache-control', 'private, max-age=300')
  headers.set('content-disposition', `inline; filename="${encodeURIComponent(collection.coverFileName ?? 'cover')}"`)
  headers.set('content-length', String(object.size))
  return new Response(object.body, { headers })
})

audioRoutes.get('/items/:itemId/cover', authMiddleware, async (c) => {
  const itemId = c.req.param('itemId')
  const db = createDb(c.env.DB)
  const item = await getItemById(db, itemId)
  if (!item) return notFound(c, 'Audio item not found')
  if (!await canReadItem(db, c.var.user.id, item)) return forbidden(c, 'You do not have access to this cover')

  const r2Key = item.coverR2Key ?? item.collectionCoverR2Key
  const contentType = item.coverContentType ?? item.collectionCoverContentType
  if (!r2Key || !contentType) return notFound(c, 'Cover not found')

  const object = await c.env.MEDIA.get(r2Key)
  if (!object?.body) return notFound(c, 'Cover not found')

  const headers = new Headers()
  headers.set('content-type', contentType)
  headers.set('cache-control', 'private, max-age=300')
  headers.set('content-disposition', `inline; filename="${encodeURIComponent(item.coverFileName ?? 'cover')}"`)
  headers.set('content-length', String(object.size))
  return new Response(object.body, { headers })
})

function parseRange(rangeHeader: string | undefined, size: number) {
  if (!rangeHeader) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim())
  if (!match) return { invalid: true as const }

  const [, rawStart, rawEnd] = match
  if (!rawStart && !rawEnd) return { invalid: true as const }

  if (!rawStart) {
    const suffix = Number(rawEnd)
    if (!Number.isFinite(suffix) || suffix <= 0) return { invalid: true as const }
    const start = Math.max(size - suffix, 0)
    return { start, end: size - 1, length: size - start }
  }

  const start = Number(rawStart)
  const end = rawEnd ? Number(rawEnd) : size - 1
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) {
    return { invalid: true as const }
  }
  const clampedEnd = Math.min(end, size - 1)
  return { start, end: clampedEnd, length: clampedEnd - start + 1 }
}

audioRoutes.get('/items/:itemId/stream', authMiddleware, async (c) => {
  const itemId = c.req.param('itemId')
  const db = createDb(c.env.DB)
  const item = await getItemById(db, itemId)
  if (!item?.audioR2Key || !item.audioContentType || !item.audioSizeBytes) return notFound(c, 'Audio not found')
  if (!await canReadItem(db, c.var.user.id, item)) return forbidden(c, 'You do not have access to this audio')

  const range = parseRange(c.req.header('range'), item.audioSizeBytes)
  if (range && 'invalid' in range) {
    return new Response(null, {
      status: 416,
      headers: { 'content-range': `bytes */${item.audioSizeBytes}` },
    })
  }

  const object = range
    ? await c.env.MEDIA.get(item.audioR2Key, { range: { offset: range.start, length: range.length } })
    : await c.env.MEDIA.get(item.audioR2Key)
  if (!object?.body) return notFound(c, 'Audio not found')

  const headers = new Headers()
  headers.set('content-type', item.audioContentType)
  headers.set('accept-ranges', 'bytes')
  headers.set('cache-control', 'private, max-age=300')
  headers.set('content-disposition', `inline; filename="${encodeURIComponent(item.audioFileName ?? 'audio')}"`)

  if (range) {
    headers.set('content-range', `bytes ${range.start}-${range.end}/${item.audioSizeBytes}`)
    headers.set('content-length', String(range.length))
    return new Response(object.body, { status: 206, headers })
  }

  headers.set('content-length', String(item.audioSizeBytes))
  return new Response(object.body, { headers })
})

export async function listPublishedAudioForCreator(db: Db, viewerId: string, creatorId: string) {
  const rows = await db
    .select(itemSelect())
    .from(audioItems)
    .innerJoin(audioCollections, eq(audioCollections.id, audioItems.collectionId))
    .innerJoin(itemCreators, eq(itemCreators.id, audioItems.creatorId))
    .where(and(
      eq(audioItems.creatorId, creatorId),
      eq(audioItems.status, 'published'),
      eq(audioCollections.status, 'published'),
    ))
    .orderBy(desc(audioItems.publishedAt))
    .limit(100)
    .all()

  const collections = await db
    .select(collectionSelect())
    .from(audioCollections)
    .innerJoin(collectionCreators, eq(collectionCreators.id, audioCollections.creatorId))
    .where(and(eq(audioCollections.creatorId, creatorId), eq(audioCollections.status, 'published')))
    .orderBy(desc(audioCollections.updatedAt))
    .limit(100)
    .all()

  const extras = await buildPostExtras(db, viewerId, rows.map((row) => row.postId))
  const serializedItems = rows.map((row) => serializeItem(row, extras))
  const itemCountByCollection = new Map<string, number>()
  for (const item of serializedItems) {
    itemCountByCollection.set(item.collection.id, (itemCountByCollection.get(item.collection.id) ?? 0) + 1)
  }

  return {
    items: serializedItems,
    albums: collections
      .filter((collection) => collection.kind === 'album')
      .map((collection) => serializeCollection(collection, itemCountByCollection.get(collection.id) ?? 0)),
    podcasts: collections
      .filter((collection) => collection.kind === 'podcast')
      .map((collection) => serializeCollection(collection, itemCountByCollection.get(collection.id) ?? 0)),
    episodes: serializedItems.filter((item) => item.kind === 'podcast_episode'),
  }
}
