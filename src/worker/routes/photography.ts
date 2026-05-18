import { Hono, type Context } from 'hono'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { createDb, type Db } from '../db/client'
import { photographyAlbums, photographyPhotos, posts, users } from '../db/schema'
import { authMiddleware, requireRole, type HonoEnv } from '../middleware/auth'
import {
  errorResponse,
  forbidden,
  notFound,
  payloadTooLarge,
  unsupportedMediaType,
} from '../lib/http'
import {
  buildPostExtras,
  hasCreatorAccess,
  imageExtension,
  MAX_PHOTOGRAPHY_ORIGINAL_SIZE,
  MAX_PHOTOGRAPHY_PREVIEW_SIZE,
  photographyPhotoOriginalUrl,
  photographyPhotoPreviewUrl,
  PHOTOGRAPHY_ORIGINAL_EXTENSIONS,
  PHOTOGRAPHY_ORIGINAL_TYPES,
  PHOTOGRAPHY_PREVIEW_TYPES,
  toUnixSeconds,
} from '../lib/post-data'
import { generatePostSlug, serializeReplies, slugify } from './posts'

export const photographyRoutes = new Hono<HonoEnv>()

type PublishStatus = 'draft' | 'published'

type AlbumRow = {
  id: string
  postId: string
  creatorId: string
  creatorDisplayName: string
  creatorUsername: string
  creatorAvatarUrl: string | null
  slug: string
  title: string
  description: string | null
  status: PublishStatus
  downloadsEnabled: boolean
  shootDate: Date | number | null
  coverPhotoId: string | null
  publishedAt: Date | number | null
  createdAt: Date | number | null
  updatedAt: Date | number | null
}

type PhotoRow = {
  id: string
  albumId: string
  creatorId: string
  title: string | null
  caption: string | null
  altText: string | null
  status: PublishStatus
  previewR2Key: string
  previewFileName: string
  previewContentType: string
  previewSizeBytes: number
  originalR2Key: string | null
  originalFileName: string | null
  originalContentType: string | null
  originalSizeBytes: number | null
  originalDownloadEnabled: boolean
  width: number | null
  height: number | null
  displayOrder: number
  createdAt: Date | number | null
  updatedAt: Date | number | null
}

type ParsedAlbumForm = {
  title: string
  description: string
  status: PublishStatus
  downloadsEnabled: boolean
  shootDate: Date | null
  coverPhotoId: string | null
}

type ParsedPhotoMetadata = {
  title?: string
  caption?: string
  altText?: string
  status?: PublishStatus
  originalDownloadEnabled?: boolean
}

const albumCreators = alias(users, 'photography_album_creators')

function parseOptionalDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null
  const date = new Date(`${value.trim()}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

function parseBoolean(value: unknown) {
  return value === true || value === 'true' || value === '1' || value === 'on'
}

function fileFromFormData(formData: FormData, key: string) {
  const value = formData.get(key)
  return value instanceof File && value.size > 0 ? value : null
}

function filesFromFormData(formData: FormData, key: string) {
  return formData.getAll(key).filter((value): value is File => value instanceof File && value.size > 0)
}

async function readForm(c: Context<HonoEnv>) {
  const contentType = c.req.header('content-type') ?? ''
  if (!contentType.includes('multipart/form-data')) {
    return errorResponse(c, 415, 'unsupported_media_type', 'Photography forms must be submitted as multipart/form-data.')
  }

  try {
    return await c.req.formData()
  } catch {
    return errorResponse(c, 422, 'validation_failed', 'Invalid multipart/form-data body')
  }
}

function getFileExtension(fileName: string) {
  const match = /\.[a-z0-9]+$/i.exec(fileName)
  return match?.[0].toLowerCase() ?? ''
}

function photographyOriginalExtension(file: File) {
  const imageExt = imageExtension(file.type)
  return imageExt || getFileExtension(file.name)
}

function validatePreview(file: File | null) {
  if (!file) return null
  if (!PHOTOGRAPHY_PREVIEW_TYPES.includes(file.type as (typeof PHOTOGRAPHY_PREVIEW_TYPES)[number])) {
    return { status: 415 as const, message: 'Unsupported preview type. Use JPEG, PNG, or WebP images.' }
  }
  if (file.size > MAX_PHOTOGRAPHY_PREVIEW_SIZE) {
    return { status: 413 as const, message: 'Preview image is too large. Maximum size is 10 MB.' }
  }
  return null
}

function validateOriginal(file: File | null) {
  if (!file) return null
  const extension = getFileExtension(file.name)
  const typeAllowed = PHOTOGRAPHY_ORIGINAL_TYPES.includes(file.type as (typeof PHOTOGRAPHY_ORIGINAL_TYPES)[number])
  const extensionAllowed = PHOTOGRAPHY_ORIGINAL_EXTENSIONS.includes(extension as (typeof PHOTOGRAPHY_ORIGINAL_EXTENSIONS)[number])
  if (!typeAllowed && !extensionAllowed) {
    return { status: 415 as const, message: 'Unsupported original type. Use JPEG, PNG, WebP, TIFF, or common RAW formats.' }
  }
  if (file.size > MAX_PHOTOGRAPHY_ORIGINAL_SIZE) {
    return { status: 413 as const, message: 'Original photo is too large. Maximum size is 90 MB.' }
  }
  return null
}

async function parseAlbumForm(c: Context<HonoEnv>): Promise<ParsedAlbumForm | Response> {
  const formData = await readForm(c)
  if (formData instanceof Response) return formData

  const title = String(formData.get('title') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const rawStatus = String(formData.get('status') ?? 'draft').trim()
  const coverPhotoId = String(formData.get('coverPhotoId') ?? '').trim() || null

  if (!title || title.length > 140) {
    return errorResponse(c, 422, 'validation_failed', 'Title is required and must be 140 characters or fewer.')
  }
  if (description.length > 1_000) {
    return errorResponse(c, 422, 'validation_failed', 'Description must be 1,000 characters or fewer.')
  }
  if (rawStatus !== 'draft' && rawStatus !== 'published') {
    return errorResponse(c, 422, 'validation_failed', 'Status must be draft or published.')
  }

  return {
    title,
    description,
    status: rawStatus,
    downloadsEnabled: parseBoolean(formData.get('downloadsEnabled')),
    shootDate: parseOptionalDate(formData.get('shootDate')),
    coverPhotoId,
  }
}

function parsePhotoMetadata(raw: unknown): ParsedPhotoMetadata[] {
  if (typeof raw !== 'string' || !raw.trim()) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is ParsedPhotoMetadata => item !== null && typeof item === 'object')
  } catch {
    return []
  }
}

async function uploadPreview(c: Context<HonoEnv>, albumId: string, photoId: string, file: File) {
  const r2Key = `photography/albums/${albumId}/photos/${photoId}/preview-${crypto.randomUUID()}${imageExtension(file.type)}`
  await c.env.MEDIA.put(r2Key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  })
  return {
    previewR2Key: r2Key,
    previewFileName: file.name || 'preview',
    previewContentType: file.type,
    previewSizeBytes: file.size,
  }
}

async function uploadOriginal(c: Context<HonoEnv>, albumId: string, photoId: string, file: File) {
  const contentType = file.type || 'application/octet-stream'
  const r2Key = `photography/albums/${albumId}/photos/${photoId}/original-${crypto.randomUUID()}${photographyOriginalExtension(file)}`
  await c.env.MEDIA.put(r2Key, await file.arrayBuffer(), {
    httpMetadata: { contentType },
  })
  return {
    originalR2Key: r2Key,
    originalFileName: file.name || 'original',
    originalContentType: contentType,
    originalSizeBytes: file.size,
  }
}

async function generateAlbumSlug(db: Db, creatorId: string, seed: string) {
  const base = slugify(seed || 'photography')
  for (let index = 0; index < 25; index += 1) {
    const candidate = index === 0 ? base : `${base}-${index + 1}`
    const existing = await db
      .select({ id: photographyAlbums.id })
      .from(photographyAlbums)
      .where(and(eq(photographyAlbums.creatorId, creatorId), eq(photographyAlbums.slug, candidate)))
      .get()
    if (!existing) return candidate
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`
}

function albumSelect() {
  return {
    id: photographyAlbums.id,
    postId: photographyAlbums.postId,
    creatorId: photographyAlbums.creatorId,
    creatorDisplayName: albumCreators.displayName,
    creatorUsername: albumCreators.username,
    creatorAvatarUrl: albumCreators.avatarUrl,
    slug: photographyAlbums.slug,
    title: photographyAlbums.title,
    description: photographyAlbums.description,
    status: photographyAlbums.status,
    downloadsEnabled: photographyAlbums.downloadsEnabled,
    shootDate: photographyAlbums.shootDate,
    coverPhotoId: photographyAlbums.coverPhotoId,
    publishedAt: photographyAlbums.publishedAt,
    createdAt: photographyAlbums.createdAt,
    updatedAt: photographyAlbums.updatedAt,
  }
}

function photoSelect() {
  return {
    id: photographyPhotos.id,
    albumId: photographyPhotos.albumId,
    creatorId: photographyPhotos.creatorId,
    title: photographyPhotos.title,
    caption: photographyPhotos.caption,
    altText: photographyPhotos.altText,
    status: photographyPhotos.status,
    previewR2Key: photographyPhotos.previewR2Key,
    previewFileName: photographyPhotos.previewFileName,
    previewContentType: photographyPhotos.previewContentType,
    previewSizeBytes: photographyPhotos.previewSizeBytes,
    originalR2Key: photographyPhotos.originalR2Key,
    originalFileName: photographyPhotos.originalFileName,
    originalContentType: photographyPhotos.originalContentType,
    originalSizeBytes: photographyPhotos.originalSizeBytes,
    originalDownloadEnabled: photographyPhotos.originalDownloadEnabled,
    width: photographyPhotos.width,
    height: photographyPhotos.height,
    displayOrder: photographyPhotos.displayOrder,
    createdAt: photographyPhotos.createdAt,
    updatedAt: photographyPhotos.updatedAt,
  }
}

function serializePhoto(row: PhotoRow, includeOriginal = false) {
  const originalUrl = includeOriginal && row.originalR2Key && row.originalDownloadEnabled ? photographyPhotoOriginalUrl(row.id) : null
  const originalCanRender = Boolean(
    originalUrl
    && row.originalContentType
    && ['image/jpeg', 'image/png', 'image/webp'].includes(row.originalContentType),
  )

  return {
    id: row.id,
    albumId: row.albumId,
    title: row.title ?? '',
    caption: row.caption ?? '',
    altText: row.altText ?? '',
    status: row.status,
    previewUrl: photographyPhotoPreviewUrl(row.id),
    displayUrl: originalCanRender && originalUrl ? originalUrl : photographyPhotoPreviewUrl(row.id),
    originalUrl,
    originalContentType: includeOriginal ? row.originalContentType : null,
    originalFileName: includeOriginal ? row.originalFileName : null,
    originalSizeBytes: includeOriginal ? row.originalSizeBytes : null,
    originalDownloadEnabled: row.originalDownloadEnabled,
    width: row.width,
    height: row.height,
    displayOrder: row.displayOrder,
    createdAt: toUnixSeconds(row.createdAt),
    updatedAt: toUnixSeconds(row.updatedAt),
  }
}

function serializeAlbum(
  row: AlbumRow,
  photos: PhotoRow[] = [],
  extras?: Awaited<ReturnType<typeof buildPostExtras>>,
) {
  const coverPhoto = photos.find((photo) => photo.id === row.coverPhotoId) ?? photos[0]
  return {
    id: row.id,
    postId: row.postId,
    type: 'photography' as const,
    slug: row.slug,
    title: row.title,
    description: row.description ?? '',
    status: row.status,
    downloadsEnabled: row.downloadsEnabled,
    shootDate: toUnixSeconds(row.shootDate),
    coverPhotoId: row.coverPhotoId,
    coverUrl: coverPhoto ? photographyPhotoPreviewUrl(coverPhoto.id) : null,
    photoCount: photos.length,
    photos: photos.map((photo) => serializePhoto(photo, row.downloadsEnabled)),
    publishedAt: toUnixSeconds(row.publishedAt),
    createdAt: toUnixSeconds(row.createdAt),
    updatedAt: toUnixSeconds(row.updatedAt),
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

async function getAlbumById(db: Db, albumId: string) {
  return db
    .select(albumSelect())
    .from(photographyAlbums)
    .innerJoin(albumCreators, eq(albumCreators.id, photographyAlbums.creatorId))
    .where(eq(photographyAlbums.id, albumId))
    .get()
}

async function getPhotoById(db: Db, photoId: string) {
  return db
    .select(photoSelect())
    .from(photographyPhotos)
    .where(eq(photographyPhotos.id, photoId))
    .get()
}

async function getAlbumPhotos(db: Db, albumId: string, includeDrafts: boolean) {
  return db
    .select(photoSelect())
    .from(photographyPhotos)
    .where(and(
      eq(photographyPhotos.albumId, albumId),
      includeDrafts ? undefined : eq(photographyPhotos.status, 'published'),
    ))
    .orderBy(asc(photographyPhotos.displayOrder))
    .all()
}

async function canReadAlbum(db: Db, viewerId: string, album: AlbumRow) {
  if (viewerId === album.creatorId) return true
  if (album.status !== 'published') return false
  return hasCreatorAccess(db, viewerId, album.creatorId)
}

async function canReadPhoto(db: Db, viewerId: string, photo: PhotoRow) {
  const album = await getAlbumById(db, photo.albumId)
  if (!album) return null
  if (viewerId === album.creatorId) return { album, allowed: true }
  if (album.status !== 'published' || photo.status !== 'published') return { album, allowed: false }
  return { album, allowed: await hasCreatorAccess(db, viewerId, album.creatorId) }
}

async function validatePublishedAlbum(db: Db, albumId: string, coverPhotoId: string | null) {
  if (!coverPhotoId) return 'Published albums need a cover photo.'
  const cover = await db
    .select({ id: photographyPhotos.id, status: photographyPhotos.status })
    .from(photographyPhotos)
    .where(and(eq(photographyPhotos.id, coverPhotoId), eq(photographyPhotos.albumId, albumId)))
    .get()
  if (!cover || cover.status !== 'published') return 'Published albums need a published cover photo.'

  const count = await db
    .select({ count: sql<number>`count(*)` })
    .from(photographyPhotos)
    .where(and(eq(photographyPhotos.albumId, albumId), eq(photographyPhotos.status, 'published')))
    .get()
  if (Number(count?.count ?? 0) === 0) return 'Published albums need at least one published photo.'
  return null
}

photographyRoutes.get('/albums/mine', authMiddleware, requireRole('creator'), async (c) => {
  const db = createDb(c.env.DB)
  const rows = await db
    .select(albumSelect())
    .from(photographyAlbums)
    .innerJoin(albumCreators, eq(albumCreators.id, photographyAlbums.creatorId))
    .where(eq(photographyAlbums.creatorId, c.var.user.id))
    .orderBy(desc(photographyAlbums.updatedAt))
    .all()

  const photos = rows.length > 0
    ? await db
        .select(photoSelect())
        .from(photographyPhotos)
        .where(inArray(photographyPhotos.albumId, rows.map((row) => row.id)))
        .orderBy(asc(photographyPhotos.displayOrder))
        .all()
    : []
  const photosByAlbum = new Map<string, PhotoRow[]>()
  for (const photo of photos) {
    photosByAlbum.set(photo.albumId, [...(photosByAlbum.get(photo.albumId) ?? []), photo])
  }

  return c.json({ albums: rows.map((row) => serializeAlbum(row, photosByAlbum.get(row.id) ?? [])) })
})

photographyRoutes.post('/albums', authMiddleware, requireRole('creator'), async (c) => {
  const parsed = await parseAlbumForm(c)
  if (parsed instanceof Response) return parsed
  if (parsed.status === 'published') {
    return errorResponse(c, 422, 'validation_failed', 'Create the album as a draft, add photos, then publish it.')
  }

  const db = createDb(c.env.DB)
  const id = crypto.randomUUID()
  const postId = crypto.randomUUID()
  const slug = await generateAlbumSlug(db, c.var.user.id, parsed.title)
  const postSlug = await generatePostSlug(db, c.var.user.id, parsed.title)

  await db.insert(posts).values({
    id: postId,
    authorId: c.var.user.id,
    kind: 'photography',
    slug: postSlug,
    body: parsed.description || parsed.title,
  }).run()

  await db.insert(photographyAlbums).values({
    id,
    postId,
    creatorId: c.var.user.id,
    slug,
    title: parsed.title,
    description: parsed.description || null,
    status: 'draft',
    downloadsEnabled: parsed.downloadsEnabled,
    shootDate: parsed.shootDate,
    coverPhotoId: null,
  }).run()

  const album = await getAlbumById(db, id)
  return c.json({ album: album ? serializeAlbum(album) : null }, 201)
})

photographyRoutes.patch('/albums/:albumId', authMiddleware, requireRole('creator'), async (c) => {
  const albumId = c.req.param('albumId')
  const parsed = await parseAlbumForm(c)
  if (parsed instanceof Response) return parsed

  const db = createDb(c.env.DB)
  const existing = await getAlbumById(db, albumId)
  if (!existing) return notFound(c, 'Photography album not found')
  if (existing.creatorId !== c.var.user.id) return forbidden(c, 'You cannot edit this album')

  if (parsed.status === 'published') {
    const issue = await validatePublishedAlbum(db, albumId, parsed.coverPhotoId ?? existing.coverPhotoId)
    if (issue) return errorResponse(c, 422, 'validation_failed', issue)
  }

  const publishedAt = parsed.status === 'published'
    ? existing.publishedAt ? new Date(toUnixSeconds(existing.publishedAt)! * 1000) : new Date()
    : null

  await db.update(posts)
    .set({ body: parsed.description || parsed.title })
    .where(eq(posts.id, existing.postId))
    .run()

  await db.update(photographyAlbums)
    .set({
      title: parsed.title,
      description: parsed.description || null,
      status: parsed.status,
      downloadsEnabled: parsed.downloadsEnabled,
      shootDate: parsed.shootDate,
      coverPhotoId: parsed.coverPhotoId ?? existing.coverPhotoId,
      publishedAt,
      updatedAt: new Date(),
    })
    .where(eq(photographyAlbums.id, albumId))
    .run()

  const album = await getAlbumById(db, albumId)
  const photos = album ? await getAlbumPhotos(db, album.id, true) : []
  return c.json({ album: album ? serializeAlbum(album, photos) : null })
})

photographyRoutes.delete('/albums/:albumId', authMiddleware, requireRole('creator'), async (c) => {
  const albumId = c.req.param('albumId')
  const db = createDb(c.env.DB)
  const existing = await getAlbumById(db, albumId)
  if (!existing) return notFound(c, 'Photography album not found')
  if (existing.creatorId !== c.var.user.id) return forbidden(c, 'You cannot delete this album')

  const count = await db
    .select({ count: sql<number>`count(*)` })
    .from(photographyPhotos)
    .where(eq(photographyPhotos.albumId, albumId))
    .get()
  if (Number(count?.count ?? 0) > 0) {
    return errorResponse(c, 409, 'album_not_empty', 'Delete the photos before deleting this album.')
  }

  await db.delete(posts).where(eq(posts.id, existing.postId)).run()
  return c.json({ ok: true })
})

photographyRoutes.post('/albums/:albumId/photos', authMiddleware, requireRole('creator'), async (c) => {
  const albumId = c.req.param('albumId')
  const formData = await readForm(c)
  if (formData instanceof Response) return formData

  const previews = filesFromFormData(formData, 'previews')
  const originals = filesFromFormData(formData, 'originals')
  const metadata = parsePhotoMetadata(formData.get('metadata'))
  if (previews.length === 0) return errorResponse(c, 422, 'validation_failed', 'Upload at least one preview photo.')
  if (previews.length > 30) return errorResponse(c, 422, 'validation_failed', 'Upload 30 photos or fewer at once.')
  if (originals.length > previews.length) {
    return errorResponse(c, 422, 'validation_failed', 'Original files must match uploaded previews by position.')
  }

  for (const preview of previews) {
    const error = validatePreview(preview)
    if (error?.status === 415) return unsupportedMediaType(c, error.message)
    if (error?.status === 413) return payloadTooLarge(c, error.message)
  }
  for (const original of originals) {
    const error = validateOriginal(original)
    if (error?.status === 415) return unsupportedMediaType(c, error.message)
    if (error?.status === 413) return payloadTooLarge(c, error.message)
  }

  const db = createDb(c.env.DB)
  const album = await getAlbumById(db, albumId)
  if (!album) return notFound(c, 'Photography album not found')
  if (album.creatorId !== c.var.user.id) return forbidden(c, 'You cannot add photos to this album')

  const [maxOrder] = await db
    .select({ value: sql<number>`coalesce(max(${photographyPhotos.displayOrder}), -1)` })
    .from(photographyPhotos)
    .where(eq(photographyPhotos.albumId, albumId))
    .all()

  const createdPhotos: PhotoRow[] = []
  for (const [index, preview] of previews.entries()) {
    const photoId = crypto.randomUUID()
    const original = originals[index] ?? null
    const meta = metadata[index] ?? {}
    const previewFields = await uploadPreview(c, albumId, photoId, preview)
    const originalFields = original ? await uploadOriginal(c, albumId, photoId, original) : {}
    const status = meta.status === 'draft' ? 'draft' : 'published'

    await db.insert(photographyPhotos).values({
      id: photoId,
      albumId,
      creatorId: c.var.user.id,
      title: typeof meta.title === 'string' ? meta.title.trim().slice(0, 140) || null : null,
      caption: typeof meta.caption === 'string' ? meta.caption.trim().slice(0, 1_000) || null : null,
      altText: typeof meta.altText === 'string' ? meta.altText.trim().slice(0, 280) || null : null,
      status,
      originalDownloadEnabled: Boolean(meta.originalDownloadEnabled),
      displayOrder: Number(maxOrder?.value ?? -1) + index + 1,
      ...previewFields,
      ...originalFields,
    }).run()

    const row = await getPhotoById(db, photoId)
    if (row) createdPhotos.push(row)
  }

  if (!album.coverPhotoId && createdPhotos[0]) {
    await db.update(photographyAlbums)
      .set({ coverPhotoId: createdPhotos[0].id, updatedAt: new Date() })
      .where(eq(photographyAlbums.id, albumId))
      .run()
  }

  return c.json({ photos: createdPhotos.map((photo) => serializePhoto(photo, album.downloadsEnabled)) }, 201)
})

photographyRoutes.patch('/photos/:photoId', authMiddleware, requireRole('creator'), async (c) => {
  const photoId = c.req.param('photoId')
  const formData = await readForm(c)
  if (formData instanceof Response) return formData

  const db = createDb(c.env.DB)
  const existing = await getPhotoById(db, photoId)
  if (!existing) return notFound(c, 'Photo not found')
  if (existing.creatorId !== c.var.user.id) return forbidden(c, 'You cannot edit this photo')

  const preview = fileFromFormData(formData, 'preview')
  const original = fileFromFormData(formData, 'original')
  const previewError = validatePreview(preview)
  if (previewError?.status === 415) return unsupportedMediaType(c, previewError.message)
  if (previewError?.status === 413) return payloadTooLarge(c, previewError.message)
  const originalError = validateOriginal(original)
  if (originalError?.status === 415) return unsupportedMediaType(c, originalError.message)
  if (originalError?.status === 413) return payloadTooLarge(c, originalError.message)

  const rawStatus = String(formData.get('status') ?? existing.status)
  if (rawStatus !== 'draft' && rawStatus !== 'published') {
    return errorResponse(c, 422, 'validation_failed', 'Status must be draft or published.')
  }

  const previewFields = preview ? await uploadPreview(c, existing.albumId, photoId, preview) : {}
  const originalFields = original ? await uploadOriginal(c, existing.albumId, photoId, original) : {}
  await db.update(photographyPhotos)
    .set({
      title: String(formData.get('title') ?? existing.title ?? '').trim().slice(0, 140) || null,
      caption: String(formData.get('caption') ?? existing.caption ?? '').trim().slice(0, 1_000) || null,
      altText: String(formData.get('altText') ?? existing.altText ?? '').trim().slice(0, 280) || null,
      status: rawStatus,
      originalDownloadEnabled: parseBoolean(formData.get('originalDownloadEnabled')),
      updatedAt: new Date(),
      ...previewFields,
      ...originalFields,
    })
    .where(eq(photographyPhotos.id, photoId))
    .run()

  await Promise.all([
    preview && existing.previewR2Key ? c.env.MEDIA.delete(existing.previewR2Key) : Promise.resolve(),
    original && existing.originalR2Key ? c.env.MEDIA.delete(existing.originalR2Key) : Promise.resolve(),
  ])

  const photo = await getPhotoById(db, photoId)
  const album = photo ? await getAlbumById(db, photo.albumId) : null
  return c.json({ photo: photo ? serializePhoto(photo, album?.downloadsEnabled ?? false) : null })
})

photographyRoutes.delete('/photos/:photoId', authMiddleware, requireRole('creator'), async (c) => {
  const photoId = c.req.param('photoId')
  const db = createDb(c.env.DB)
  const existing = await getPhotoById(db, photoId)
  if (!existing) return notFound(c, 'Photo not found')
  if (existing.creatorId !== c.var.user.id) return forbidden(c, 'You cannot delete this photo')

  const album = await getAlbumById(db, existing.albumId)
  await db.delete(photographyPhotos).where(eq(photographyPhotos.id, photoId)).run()
  if (album?.coverPhotoId === photoId) {
    await db.update(photographyAlbums)
      .set({ coverPhotoId: null, status: 'draft', publishedAt: null, updatedAt: new Date() })
      .where(eq(photographyAlbums.id, existing.albumId))
      .run()
  }
  await Promise.all([
    c.env.MEDIA.delete(existing.previewR2Key),
    existing.originalR2Key ? c.env.MEDIA.delete(existing.originalR2Key) : Promise.resolve(),
  ])
  return c.json({ ok: true })
})

photographyRoutes.put('/albums/:albumId/order', authMiddleware, requireRole('creator'), async (c) => {
  const albumId = c.req.param('albumId')
  const body = await c.req.json().catch(() => null) as { photoIds?: unknown } | null
  const photoIds = Array.isArray(body?.photoIds) ? body.photoIds.filter((id: unknown): id is string => typeof id === 'string') : []
  if (photoIds.length === 0) {
    return errorResponse(c, 422, 'validation_failed', 'photoIds must include at least one photo.')
  }

  const db = createDb(c.env.DB)
  const album = await getAlbumById(db, albumId)
  if (!album) return notFound(c, 'Photography album not found')
  if (album.creatorId !== c.var.user.id) return forbidden(c, 'You cannot reorder this album')

  const existing = await db
    .select({ id: photographyPhotos.id })
    .from(photographyPhotos)
    .where(eq(photographyPhotos.albumId, albumId))
    .all()
  const existingIds = new Set(existing.map((photo) => photo.id))
  const submittedIds = new Set(photoIds)
  if (existingIds.size !== submittedIds.size || photoIds.some((id) => !existingIds.has(id))) {
    return errorResponse(c, 422, 'validation_failed', 'Order must include every photo in this album exactly once.')
  }

  for (const [index, id] of photoIds.entries()) {
    await db.update(photographyPhotos).set({ displayOrder: index, updatedAt: new Date() }).where(eq(photographyPhotos.id, id)).run()
  }
  return c.json({ ok: true })
})

photographyRoutes.get('/albums/by-slug/:username/:slug', authMiddleware, async (c) => {
  const username = c.req.param('username')
  const slug = c.req.param('slug')
  const db = createDb(c.env.DB)
  const album = await db
    .select(albumSelect())
    .from(photographyAlbums)
    .innerJoin(albumCreators, eq(albumCreators.id, photographyAlbums.creatorId))
    .where(and(eq(albumCreators.username, username), eq(photographyAlbums.slug, slug)))
    .get()

  if (!album) return notFound(c, 'Photography album not found')
  if (!await canReadAlbum(db, c.var.user.id, album)) {
    return forbidden(c, 'You do not have access to this photography album')
  }

  const photos = await getAlbumPhotos(db, album.id, c.var.user.id === album.creatorId)
  const [extras, replies] = await Promise.all([
    buildPostExtras(db, c.var.user.id, [album.postId]),
    serializeReplies(db, c.var.user.id, album.postId),
  ])
  return c.json({ album: serializeAlbum(album, photos, extras), photos: photos.map((photo) => serializePhoto(photo, album.downloadsEnabled)), replies })
})

photographyRoutes.get('/photos/:photoId/preview', authMiddleware, async (c) => {
  const photoId = c.req.param('photoId')
  const db = createDb(c.env.DB)
  const photo = await getPhotoById(db, photoId)
  if (!photo) return notFound(c, 'Photo not found')
  const access = await canReadPhoto(db, c.var.user.id, photo)
  if (!access?.allowed) return forbidden(c, 'You do not have access to this photo')

  const object = await c.env.MEDIA.get(photo.previewR2Key)
  if (!object?.body) return notFound(c, 'Photo not found')

  const headers = new Headers()
  headers.set('content-type', photo.previewContentType)
  headers.set('cache-control', 'private, max-age=300')
  headers.set('content-disposition', `inline; filename="${encodeURIComponent(photo.previewFileName)}"`)
  headers.set('content-length', String(object.size))
  return new Response(object.body, { headers })
})

photographyRoutes.get('/photos/:photoId/original', authMiddleware, async (c) => {
  const photoId = c.req.param('photoId')
  const db = createDb(c.env.DB)
  const photo = await getPhotoById(db, photoId)
  if (!photo?.originalR2Key || !photo.originalContentType || !photo.originalFileName) return notFound(c, 'Original photo not found')
  const access = await canReadPhoto(db, c.var.user.id, photo)
  if (!access?.allowed) return forbidden(c, 'You do not have access to this photo')
  if (c.var.user.id !== access.album.creatorId && (!access.album.downloadsEnabled || !photo.originalDownloadEnabled)) {
    return forbidden(c, 'Original downloads are not enabled for this photo')
  }

  const object = await c.env.MEDIA.get(photo.originalR2Key)
  if (!object?.body) return notFound(c, 'Original photo not found')

  const headers = new Headers()
  headers.set('content-type', photo.originalContentType)
  headers.set('cache-control', 'private, max-age=300')
  headers.set('content-disposition', `attachment; filename="${encodeURIComponent(photo.originalFileName)}"`)
  headers.set('content-length', String(object.size))
  return new Response(object.body, { headers })
})

export async function listPublishedPhotographyForCreator(db: Db, viewerId: string, creatorId: string) {
  const albums = await db
    .select(albumSelect())
    .from(photographyAlbums)
    .innerJoin(albumCreators, eq(albumCreators.id, photographyAlbums.creatorId))
    .where(and(eq(photographyAlbums.creatorId, creatorId), eq(photographyAlbums.status, 'published')))
    .orderBy(desc(photographyAlbums.publishedAt))
    .limit(100)
    .all()

  const photos = albums.length > 0
    ? await db
        .select(photoSelect())
        .from(photographyPhotos)
        .where(and(
          inArray(photographyPhotos.albumId, albums.map((album) => album.id)),
          eq(photographyPhotos.status, 'published'),
        ))
        .orderBy(asc(photographyPhotos.displayOrder))
        .all()
    : []
  const photosByAlbum = new Map<string, PhotoRow[]>()
  for (const photo of photos) {
    photosByAlbum.set(photo.albumId, [...(photosByAlbum.get(photo.albumId) ?? []), photo])
  }

  const extras = await buildPostExtras(db, viewerId, albums.map((album) => album.postId))
  const serializedAlbums = albums.map((album) => serializeAlbum(album, photosByAlbum.get(album.id) ?? [], extras))
  return {
    albums: serializedAlbums,
    photos: photos.map((photo) => serializePhoto(photo, albums.find((album) => album.id === photo.albumId)?.downloadsEnabled ?? false)),
  }
}
