import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { and, asc, count, desc, eq, inArray, like, or, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { createDb } from '../db/client'
import {
  articles,
  audioCollections,
  audioItems,
  courses,
  photographyAlbums,
  photographyPhotos,
  posts,
  savedItems,
  users,
} from '../db/schema'
import { authMiddleware, type HonoEnv } from '../middleware/auth'
import { forbidden, notFound, zodHook } from '../lib/http'
import {
  articleCoverUrl,
  audioCollectionCoverUrl,
  audioItemCoverUrl,
  audioStreamUrl,
  buildPostExtras,
  hasCreatorAccess,
  photographyPhotoPreviewUrl,
  toUnixSeconds,
} from '../lib/post-data'

export const libraryRoutes = new Hono<HonoEnv>()

const libraryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  type: z.enum(['all', 'post', 'article', 'audio', 'photography', 'course']).default('all'),
  sort: z.enum(['newest', 'oldest']).default('newest'),
  query: z.string().trim().max(100).default(''),
})

const postIdSchema = z.object({ postId: z.string().min(1) })

function currentAccessSql(viewerId: string, now: number) {
  return sql<number>`CASE WHEN ${posts.authorId} = ${viewerId} OR EXISTS (
    SELECT 1 FROM subscription_memberships sm
    WHERE sm.subscriber_id = ${viewerId}
      AND sm.creator_id = ${posts.authorId}
      AND (sm.status = 'active' OR (sm.status = 'trialing' AND sm.trial_ends_at > ${now}))
  ) THEN 1 ELSE 0 END`
}

function publishedVisibleSql() {
  return sql<number>`CASE WHEN ${posts.moderationStatus} = 'active'
    AND ${users.accountStatus} = 'active'
    AND ${posts.publishedAt} IS NOT NULL
    AND CASE ${posts.kind}
      WHEN 'article' THEN ${articles.status} = 'published'
      WHEN 'audio' THEN ${audioItems.status} = 'published' AND ${audioCollections.status} = 'published'
      WHEN 'photography' THEN ${photographyAlbums.status} = 'published'
      WHEN 'course' THEN ${courses.status} = 'published'
      ELSE 1
    END
  THEN 1 ELSE 0 END`
}

libraryRoutes.get('/', authMiddleware, zValidator('query', libraryQuerySchema, zodHook), async (c) => {
  const { page, pageSize, type, sort, query } = c.req.valid('query')
  const db = createDb(c.env.DB)
  const viewerId = c.var.user.id
  const now = Math.floor(Date.now() / 1000)
  const hasAccess = currentAccessSql(viewerId, now)
  const isPublishedVisible = publishedVisibleSql()
  const conditions = [eq(savedItems.userId, viewerId)]

  if (type !== 'all') conditions.push(eq(posts.kind, type))
  if (query) {
    const pattern = `%${query.toLowerCase()}%`
    const creatorSearch = or(
      like(sql`lower(${users.displayName})`, pattern),
      like(sql`lower(${users.username})`, pattern),
    )
    const contentSearch = or(
      like(sql`lower(${posts.body})`, pattern),
      like(sql`lower(coalesce(${articles.title}, ''))`, pattern),
      like(sql`lower(coalesce(${audioItems.title}, ''))`, pattern),
      like(sql`lower(coalesce(${photographyAlbums.title}, ''))`, pattern),
      like(sql`lower(coalesce(${courses.title}, ''))`, pattern),
    )
    conditions.push(or(
      and(sql`${isPublishedVisible} = 1`, creatorSearch),
      and(sql`${isPublishedVisible} = 1`, sql`${hasAccess} = 1`, contentSearch),
    )!)
  }

  const where = and(...conditions)
  const baseQuery = db
    .select({ count: count() })
    .from(savedItems)
    .innerJoin(posts, eq(posts.id, savedItems.postId))
    .innerJoin(users, eq(users.id, posts.authorId))
    .leftJoin(articles, eq(articles.postId, posts.id))
    .leftJoin(audioItems, eq(audioItems.postId, posts.id))
    .leftJoin(audioCollections, eq(audioCollections.id, audioItems.collectionId))
    .leftJoin(photographyAlbums, eq(photographyAlbums.postId, posts.id))
    .leftJoin(courses, eq(courses.postId, posts.id))
    .where(where)

  const [totalRow, rows] = await Promise.all([
    baseQuery.get(),
    getLibraryRows(db, where, hasAccess, sort, pageSize, (page - 1) * pageSize),
  ])

  const availableRows = rows.filter((row) => isRowPublishedAndVisible(row) && Boolean(row.hasAccess))
  const availablePostIds = availableRows.map((row) => row.postId)
  const photographyIds = availableRows.flatMap((row) => row.photographyId ? [row.photographyId] : [])
  const [extras, photos] = await Promise.all([
    buildPostExtras(db, viewerId, availablePostIds),
    photographyIds.length
      ? db.select().from(photographyPhotos).where(and(
          inArray(photographyPhotos.albumId, photographyIds),
          eq(photographyPhotos.status, 'published'),
        )).orderBy(photographyPhotos.displayOrder).all()
      : Promise.resolve([]),
  ])
  const photosByAlbum = new Map<string, typeof photos>()
  for (const photo of photos) photosByAlbum.set(photo.albumId, [...(photosByAlbum.get(photo.albumId) ?? []), photo])

  const items = rows.map((row) => {
    const savedAt = toUnixSeconds(row.savedAt)
    if (!isRowPublishedAndVisible(row)) {
      return { availability: 'unavailable' as const, postId: row.postId, type: row.kind, savedAt }
    }
    if (!row.hasAccess) {
      return {
        availability: 'membership_required' as const,
        postId: row.postId,
        type: row.kind,
        savedAt,
        creator: {
          id: row.authorId,
          displayName: row.authorDisplayName,
          username: row.authorUsername,
          avatarUrl: row.authorAvatarUrl,
        },
      }
    }
    return { availability: 'available' as const, postId: row.postId, type: row.kind, savedAt, item: serializeAvailable(row, extras, photosByAlbum) }
  })

  return c.json({ items, page, pageSize, total: Number(totalRow?.count ?? 0) })
})

libraryRoutes.post('/:postId', authMiddleware, zValidator('param', postIdSchema, zodHook), async (c) => {
  const { postId } = c.req.valid('param')
  const db = createDb(c.env.DB)
  const row = await getSavablePost(db, postId)
  if (!row || !isRowPublishedAndVisible(row)) return notFound(c, 'Content not found')
  if (!await hasCreatorAccess(db, c.var.user.id, row.authorId)) return forbidden(c, 'Subscribe to save this content')

  await db.insert(savedItems).values({ userId: c.var.user.id, postId }).onConflictDoNothing().run()
  return c.json({ saved: true })
})

libraryRoutes.delete('/:postId', authMiddleware, zValidator('param', postIdSchema, zodHook), async (c) => {
  const { postId } = c.req.valid('param')
  const db = createDb(c.env.DB)
  await db.delete(savedItems).where(and(eq(savedItems.userId, c.var.user.id), eq(savedItems.postId, postId))).run()
  return c.json({ saved: false })
})

function isRowPublishedAndVisible(row: {
  kind: string
  moderationStatus: string
  authorAccountStatus: string
  postPublishedAt: Date | number | null
  articleStatus: string | null
  audioStatus: string | null
  audioCollectionStatus: string | null
  photographyStatus: string | null
  courseStatus: string | null
}) {
  if (row.moderationStatus !== 'active' || row.authorAccountStatus !== 'active' || !row.postPublishedAt) return false
  if (row.kind === 'article') return row.articleStatus === 'published'
  if (row.kind === 'audio') return row.audioStatus === 'published' && row.audioCollectionStatus === 'published'
  if (row.kind === 'photography') return row.photographyStatus === 'published'
  if (row.kind === 'course') return row.courseStatus === 'published'
  return row.kind === 'post'
}

async function getLibraryRows(
  db: ReturnType<typeof createDb>,
  where: SQL | undefined,
  hasAccess: SQL<number>,
  sort: 'newest' | 'oldest',
  limit: number,
  offset: number,
) {
  return db
    .select({
      savedAt: savedItems.savedAt,
      hasAccess,
      postId: posts.id,
      kind: posts.kind,
      postSlug: posts.slug,
      postBody: posts.body,
      postCreatedAt: posts.createdAt,
      postPublishedAt: posts.publishedAt,
      moderationStatus: posts.moderationStatus,
      authorId: users.id,
      authorDisplayName: users.displayName,
      authorUsername: users.username,
      authorAvatarUrl: users.avatarUrl,
      authorAccountStatus: users.accountStatus,
      articleTitle: articles.title,
      articleExcerpt: articles.excerpt,
      articleStatus: articles.status,
      articleCoverR2Key: articles.coverR2Key,
      articlePublishedAt: articles.publishedAt,
      articleUpdatedAt: articles.updatedAt,
      audioId: audioItems.id,
      audioSlug: audioItems.slug,
      audioKind: audioItems.kind,
      audioTitle: audioItems.title,
      audioDescription: audioItems.description,
      audioStatus: audioItems.status,
      audioR2Key: audioItems.audioR2Key,
      audioCoverR2Key: audioItems.coverR2Key,
      audioDurationSeconds: audioItems.durationSeconds,
      audioDisplayOrder: audioItems.displayOrder,
      audioPublishedAt: audioItems.publishedAt,
      audioCreatedAt: audioItems.createdAt,
      audioUpdatedAt: audioItems.updatedAt,
      audioCollectionId: audioCollections.id,
      audioCollectionKind: audioCollections.kind,
      audioCollectionSlug: audioCollections.slug,
      audioCollectionTitle: audioCollections.title,
      audioCollectionStatus: audioCollections.status,
      audioCollectionCoverR2Key: audioCollections.coverR2Key,
      photographyId: photographyAlbums.id,
      photographySlug: photographyAlbums.slug,
      photographyTitle: photographyAlbums.title,
      photographyDescription: photographyAlbums.description,
      photographyStatus: photographyAlbums.status,
      photographyDownloadsEnabled: photographyAlbums.downloadsEnabled,
      photographyShootDate: photographyAlbums.shootDate,
      photographyCoverPhotoId: photographyAlbums.coverPhotoId,
      photographyPublishedAt: photographyAlbums.publishedAt,
      photographyCreatedAt: photographyAlbums.createdAt,
      photographyUpdatedAt: photographyAlbums.updatedAt,
      courseId: courses.id,
      courseSlug: courses.slug,
      courseTitle: courses.title,
      courseDescription: courses.description,
      courseStatus: courses.status,
      coursePublishedAt: courses.publishedAt,
      courseCreatedAt: courses.createdAt,
      courseUpdatedAt: courses.updatedAt,
    })
    .from(savedItems)
    .innerJoin(posts, eq(posts.id, savedItems.postId))
    .innerJoin(users, eq(users.id, posts.authorId))
    .leftJoin(articles, eq(articles.postId, posts.id))
    .leftJoin(audioItems, eq(audioItems.postId, posts.id))
    .leftJoin(audioCollections, eq(audioCollections.id, audioItems.collectionId))
    .leftJoin(photographyAlbums, eq(photographyAlbums.postId, posts.id))
    .leftJoin(courses, eq(courses.postId, posts.id))
    .where(where)
    .orderBy(sort === 'newest' ? desc(savedItems.savedAt) : asc(savedItems.savedAt))
    .limit(limit)
    .offset(offset)
    .all()
}

async function getSavablePost(db: ReturnType<typeof createDb>, postId: string) {
  return db.select({
    postId: posts.id,
    kind: posts.kind,
    authorId: posts.authorId,
    moderationStatus: posts.moderationStatus,
    postPublishedAt: posts.publishedAt,
    authorAccountStatus: users.accountStatus,
    articleStatus: articles.status,
    audioStatus: audioItems.status,
    audioCollectionStatus: audioCollections.status,
    photographyStatus: photographyAlbums.status,
    courseStatus: courses.status,
  })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.authorId))
    .leftJoin(articles, eq(articles.postId, posts.id))
    .leftJoin(audioItems, eq(audioItems.postId, posts.id))
    .leftJoin(audioCollections, eq(audioCollections.id, audioItems.collectionId))
    .leftJoin(photographyAlbums, eq(photographyAlbums.postId, posts.id))
    .leftJoin(courses, eq(courses.postId, posts.id))
    .where(eq(posts.id, postId))
    .get()
}

type HydratedLibraryRow = Awaited<ReturnType<typeof getLibraryRows>>[number]
type LibraryPhoto = typeof photographyPhotos.$inferSelect

function serializeAvailable(row: HydratedLibraryRow, extras: Awaited<ReturnType<typeof buildPostExtras>>, photosByAlbum: Map<string, LibraryPhoto[]>) {
  const author = { id: row.authorId, displayName: row.authorDisplayName, username: row.authorUsername, avatarUrl: row.authorAvatarUrl }
  const interactions = {
    likeCount: extras.postLikeCounts.get(row.postId) ?? 0,
    replyCount: extras.postReplyCounts.get(row.postId) ?? 0,
    viewerLiked: extras.viewerLikedPostIds.has(row.postId),
    viewerSaved: true,
  }
  if (row.kind === 'article') return {
    id: row.postId, postId: row.postId, type: 'article' as const, slug: row.postSlug,
    title: row.articleTitle, excerpt: row.articleExcerpt || row.postBody, markdown: '', status: row.articleStatus,
    coverUrl: row.articleCoverR2Key ? articleCoverUrl(row.postId) : null,
    createdAt: toUnixSeconds(row.postCreatedAt), publishedAt: toUnixSeconds(row.articlePublishedAt), updatedAt: toUnixSeconds(row.articleUpdatedAt),
    author, ...interactions,
  }
  if (row.kind === 'audio') {
    const audioId = row.audioId!
    const collectionId = row.audioCollectionId!
    return {
    id: audioId, postId: row.postId, type: 'audio' as const, kind: row.audioKind, slug: row.audioSlug,
    title: row.audioTitle, description: row.audioDescription || '', status: row.audioStatus,
    streamUrl: row.audioR2Key ? audioStreamUrl(audioId) : null,
    coverUrl: row.audioCoverR2Key ? audioItemCoverUrl(audioId) : row.audioCollectionCoverR2Key ? audioCollectionCoverUrl(collectionId) : null,
    durationSeconds: row.audioDurationSeconds,
    displayOrder: row.audioDisplayOrder,
    createdAt: toUnixSeconds(row.audioCreatedAt), publishedAt: toUnixSeconds(row.audioPublishedAt), updatedAt: toUnixSeconds(row.audioUpdatedAt),
    collection: { id: collectionId, kind: row.audioCollectionKind, slug: row.audioCollectionSlug, title: row.audioCollectionTitle, coverUrl: row.audioCollectionCoverR2Key ? audioCollectionCoverUrl(collectionId) : null },
    author, ...interactions,
  }
  }
  if (row.kind === 'photography') {
    const photographyId = row.photographyId!
    const photos = photosByAlbum.get(photographyId) ?? []
    const cover = photos.find((photo) => photo.id === row.photographyCoverPhotoId) ?? photos[0]
    return {
      id: photographyId, postId: row.postId, type: 'photography' as const, slug: row.photographySlug,
      title: row.photographyTitle, description: row.photographyDescription ?? '', status: row.photographyStatus,
      downloadsEnabled: row.photographyDownloadsEnabled, shootDate: toUnixSeconds(row.photographyShootDate),
      coverPhotoId: row.photographyCoverPhotoId, coverUrl: cover ? photographyPhotoPreviewUrl(cover.id) : null,
      photoCount: photos.length,
      photos: photos.slice(0, 4).map((photo) => ({
        id: photo.id, albumId: photo.albumId, title: photo.title ?? '', caption: photo.caption ?? '', altText: photo.altText ?? '',
        status: photo.status, previewUrl: photographyPhotoPreviewUrl(photo.id), displayUrl: photographyPhotoPreviewUrl(photo.id),
        originalUrl: null, originalContentType: null, originalFileName: null, originalSizeBytes: null,
        originalDownloadEnabled: photo.originalDownloadEnabled, width: null, height: null,
        displayOrder: photo.displayOrder, createdAt: toUnixSeconds(photo.createdAt), updatedAt: toUnixSeconds(photo.updatedAt),
      })),
      createdAt: toUnixSeconds(row.photographyCreatedAt), publishedAt: toUnixSeconds(row.photographyPublishedAt), updatedAt: toUnixSeconds(row.photographyUpdatedAt),
      author, ...interactions,
    }
  }
  if (row.kind === 'course') return {
    id: row.courseId, postId: row.postId, type: 'course' as const, slug: row.courseSlug,
    title: row.courseTitle, description: row.courseDescription ?? '', status: row.courseStatus,
    createdAt: toUnixSeconds(row.courseCreatedAt), publishedAt: toUnixSeconds(row.coursePublishedAt), updatedAt: toUnixSeconds(row.courseUpdatedAt),
    creator: author, ...interactions,
  }
  return {
    id: row.postId, type: 'post' as const, slug: row.postSlug, body: row.postBody,
    createdAt: toUnixSeconds(row.postCreatedAt), author,
    attachments: extras.attachmentsByPostId.get(row.postId) ?? [], ...interactions,
    poll: extras.pollsByPostId.get(row.postId) ?? null,
  }
}
