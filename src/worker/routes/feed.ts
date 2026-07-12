import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { and, desc, eq, gt, inArray, or } from 'drizzle-orm'
import { createDb } from '../db/client'
import { articles, audioCollections, audioItems, courses, photographyAlbums, photographyPhotos, posts, follows, users, subscriptionMemberships, membershipPlans } from '../db/schema'
import { authMiddleware, type HonoEnv } from '../middleware/auth'
import { subscribeSchema } from '../lib/schemas'
import { conflict, notFound, zodHook } from '../lib/http'
import { articleCoverUrl, audioCollectionCoverUrl, audioItemCoverUrl, audioStreamUrl, buildPostExtras, photographyPhotoPreviewUrl, toUnixSeconds } from '../lib/post-data'

export const feedRoutes = new Hono<HonoEnv>()

// ── GET / ──────────────────────────────────────────────────────────────────

feedRoutes.get('/', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)
  const now = Math.floor(Date.now() / 1000)

  const rows = await db
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
    .innerJoin(subscriptionMemberships, eq(subscriptionMemberships.creatorId, posts.authorId))
    .innerJoin(users, eq(users.id, posts.authorId))
    .where(and(
      eq(posts.kind, 'post'),
      eq(posts.moderationStatus, 'active'),
      eq(users.accountStatus, 'active'),
      eq(subscriptionMemberships.subscriberId, c.var.user.id),
      or(
        eq(subscriptionMemberships.status, 'active'),
        and(eq(subscriptionMemberships.status, 'trialing'), gt(subscriptionMemberships.trialEndsAt, now)),
      ),
    ))
    .orderBy(desc(posts.createdAt))
    .limit(50)
    .all()

  const articleRows = await db
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
      title: articles.title,
      excerpt: articles.excerpt,
      markdown: articles.markdown,
      status: articles.status,
      coverR2Key: articles.coverR2Key,
      publishedAt: articles.publishedAt,
      updatedAt: articles.updatedAt,
    })
    .from(articles)
    .innerJoin(posts, eq(posts.id, articles.postId))
    .innerJoin(subscriptionMemberships, eq(subscriptionMemberships.creatorId, posts.authorId))
    .innerJoin(users, eq(users.id, posts.authorId))
    .where(and(
      eq(posts.kind, 'article'),
      eq(posts.moderationStatus, 'active'),
      eq(users.accountStatus, 'active'),
      eq(articles.status, 'published'),
      eq(subscriptionMemberships.subscriberId, c.var.user.id),
      or(
        eq(subscriptionMemberships.status, 'active'),
        and(eq(subscriptionMemberships.status, 'trialing'), gt(subscriptionMemberships.trialEndsAt, now)),
      ),
    ))
    .orderBy(desc(articles.publishedAt))
    .limit(50)
    .all()

  const audioRows = await db
    .select({
      id: audioItems.id,
      postId: audioItems.postId,
      slug: audioItems.slug,
      itemKind: audioItems.kind,
      title: audioItems.title,
      description: audioItems.description,
      status: audioItems.status,
      audioR2Key: audioItems.audioR2Key,
      coverR2Key: audioItems.coverR2Key,
      durationSeconds: audioItems.durationSeconds,
      publishedAt: audioItems.publishedAt,
      createdAt: audioItems.createdAt,
      updatedAt: audioItems.updatedAt,
      authorId: audioItems.creatorId,
      authorDisplayName: users.displayName,
      authorUsername: users.username,
      authorAvatarUrl: users.avatarUrl,
      collectionId: audioCollections.id,
      collectionKind: audioCollections.kind,
      collectionSlug: audioCollections.slug,
      collectionTitle: audioCollections.title,
      collectionCoverR2Key: audioCollections.coverR2Key,
    })
    .from(audioItems)
    .innerJoin(posts, eq(posts.id, audioItems.postId))
    .innerJoin(audioCollections, eq(audioCollections.id, audioItems.collectionId))
    .innerJoin(subscriptionMemberships, eq(subscriptionMemberships.creatorId, audioItems.creatorId))
    .innerJoin(users, eq(users.id, audioItems.creatorId))
    .where(and(
      eq(audioItems.status, 'published'),
      eq(posts.moderationStatus, 'active'),
      eq(users.accountStatus, 'active'),
      eq(audioCollections.status, 'published'),
      eq(subscriptionMemberships.subscriberId, c.var.user.id),
      or(
        eq(subscriptionMemberships.status, 'active'),
        and(eq(subscriptionMemberships.status, 'trialing'), gt(subscriptionMemberships.trialEndsAt, now)),
      ),
    ))
    .orderBy(desc(audioItems.publishedAt))
    .limit(50)
    .all()

  const photographyRows = await db
    .select({
      id: photographyAlbums.id,
      postId: photographyAlbums.postId,
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
      authorId: photographyAlbums.creatorId,
      authorDisplayName: users.displayName,
      authorUsername: users.username,
      authorAvatarUrl: users.avatarUrl,
    })
    .from(photographyAlbums)
    .innerJoin(posts, eq(posts.id, photographyAlbums.postId))
    .innerJoin(subscriptionMemberships, eq(subscriptionMemberships.creatorId, photographyAlbums.creatorId))
    .innerJoin(users, eq(users.id, photographyAlbums.creatorId))
    .where(and(
      eq(photographyAlbums.status, 'published'),
      eq(posts.moderationStatus, 'active'),
      eq(users.accountStatus, 'active'),
      eq(subscriptionMemberships.subscriberId, c.var.user.id),
      or(
        eq(subscriptionMemberships.status, 'active'),
        and(eq(subscriptionMemberships.status, 'trialing'), gt(subscriptionMemberships.trialEndsAt, now)),
      ),
    ))
    .orderBy(desc(photographyAlbums.publishedAt))
    .limit(50)
    .all()

  const courseRows = await db
    .select({
      id: courses.id,
      postId: courses.postId,
      slug: courses.slug,
      title: courses.title,
      description: courses.description,
      status: courses.status,
      publishedAt: courses.publishedAt,
      createdAt: courses.createdAt,
      updatedAt: courses.updatedAt,
      authorId: courses.creatorId,
      authorDisplayName: users.displayName,
      authorUsername: users.username,
      authorAvatarUrl: users.avatarUrl,
    })
    .from(courses)
    .innerJoin(posts, eq(posts.id, courses.postId))
    .innerJoin(subscriptionMemberships, eq(subscriptionMemberships.creatorId, courses.creatorId))
    .innerJoin(users, eq(users.id, courses.creatorId))
    .where(and(
      eq(courses.status, 'published'),
      eq(posts.moderationStatus, 'active'),
      eq(users.accountStatus, 'active'),
      eq(subscriptionMemberships.subscriberId, c.var.user.id),
      or(
        eq(subscriptionMemberships.status, 'active'),
        and(eq(subscriptionMemberships.status, 'trialing'), gt(subscriptionMemberships.trialEndsAt, now)),
      ),
    ))
    .orderBy(desc(courses.publishedAt))
    .limit(50)
    .all()

  const photographyPhotosRows = photographyRows.length > 0
    ? await db
        .select({
          id: photographyPhotos.id,
          albumId: photographyPhotos.albumId,
          title: photographyPhotos.title,
          caption: photographyPhotos.caption,
          altText: photographyPhotos.altText,
          status: photographyPhotos.status,
          originalDownloadEnabled: photographyPhotos.originalDownloadEnabled,
          displayOrder: photographyPhotos.displayOrder,
        })
        .from(photographyPhotos)
        .where(and(
          inArray(photographyPhotos.albumId, photographyRows.map((row) => row.id)),
          eq(photographyPhotos.status, 'published'),
        ))
        .orderBy(photographyPhotos.displayOrder)
        .all()
    : []
  const photographyPhotosByAlbum = new Map<string, typeof photographyPhotosRows>()
  for (const photo of photographyPhotosRows) {
    photographyPhotosByAlbum.set(photo.albumId, [...(photographyPhotosByAlbum.get(photo.albumId) ?? []), photo])
  }

  if (rows.length === 0 && articleRows.length === 0 && audioRows.length === 0 && photographyRows.length === 0 && courseRows.length === 0) {
    return c.json({ posts: [], items: [], message: "You haven't subscribed to any creators yet" })
  }

  const allIds = [
    ...rows.map((row) => row.id),
    ...articleRows.map((row) => row.id),
    ...audioRows.map((row) => row.postId),
    ...photographyRows.map((row) => row.postId),
    ...courseRows.map((row) => row.postId),
  ]
  const extras = await buildPostExtras(db, c.var.user.id, allIds)

  const mappedPosts = rows.map((row) => {
    const createdAt = toUnixSeconds(row.createdAt)
    return {
      id: row.id,
      type: 'post' as const,
      slug: row.slug,
      body: row.body,
      createdAt,
      author: {
        id: row.authorId,
        displayName: row.authorDisplayName,
        username: row.authorUsername,
        avatarUrl: row.authorAvatarUrl,
      },
      attachments: extras.attachmentsByPostId.get(row.id) ?? [],
      likeCount: extras.postLikeCounts.get(row.id) ?? 0,
      replyCount: extras.postReplyCounts.get(row.id) ?? 0,
      viewerLiked: extras.viewerLikedPostIds.has(row.id),
      poll: extras.pollsByPostId.get(row.id) ?? null,
    }
  })

  const mappedArticles = articleRows.map((row) => ({
    id: row.id,
    postId: row.id,
    type: 'article' as const,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt || row.body,
    markdown: '',
    status: row.status,
    coverUrl: row.coverR2Key ? articleCoverUrl(row.id) : null,
    createdAt: toUnixSeconds(row.createdAt),
    publishedAt: toUnixSeconds(row.publishedAt),
    updatedAt: toUnixSeconds(row.updatedAt),
    author: {
      id: row.authorId,
      displayName: row.authorDisplayName,
      username: row.authorUsername,
      avatarUrl: row.authorAvatarUrl,
    },
    likeCount: extras.postLikeCounts.get(row.id) ?? 0,
    replyCount: extras.postReplyCounts.get(row.id) ?? 0,
    viewerLiked: extras.viewerLikedPostIds.has(row.id),
  }))

  const mappedAudio = audioRows.map((row) => ({
    id: row.id,
    postId: row.postId,
    type: 'audio' as const,
    kind: row.itemKind,
    slug: row.slug,
    title: row.title,
    description: row.description || '',
    status: row.status,
    streamUrl: row.audioR2Key ? audioStreamUrl(row.id) : null,
    coverUrl: row.coverR2Key ? audioItemCoverUrl(row.id) : row.collectionCoverR2Key ? audioCollectionCoverUrl(row.collectionId) : null,
    durationSeconds: row.durationSeconds,
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
      id: row.authorId,
      displayName: row.authorDisplayName,
      username: row.authorUsername,
      avatarUrl: row.authorAvatarUrl,
    },
    likeCount: extras.postLikeCounts.get(row.postId) ?? 0,
    replyCount: extras.postReplyCounts.get(row.postId) ?? 0,
    viewerLiked: extras.viewerLikedPostIds.has(row.postId),
  }))

  const mappedPhotography = photographyRows.map((row) => {
    const photos = photographyPhotosByAlbum.get(row.id) ?? []
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
      photos: photos.slice(0, 4).map((photo) => ({
        id: photo.id,
        albumId: photo.albumId,
        title: photo.title ?? '',
        caption: photo.caption ?? '',
        altText: photo.altText ?? '',
        status: photo.status,
        previewUrl: photographyPhotoPreviewUrl(photo.id),
        displayUrl: photographyPhotoPreviewUrl(photo.id),
        originalUrl: null,
        originalContentType: null,
        originalFileName: null,
        originalSizeBytes: null,
        originalDownloadEnabled: photo.originalDownloadEnabled,
        width: null,
        height: null,
        displayOrder: photo.displayOrder,
        createdAt: null,
        updatedAt: null,
      })),
      createdAt: toUnixSeconds(row.createdAt),
      publishedAt: toUnixSeconds(row.publishedAt),
      updatedAt: toUnixSeconds(row.updatedAt),
      author: {
        id: row.authorId,
        displayName: row.authorDisplayName,
        username: row.authorUsername,
        avatarUrl: row.authorAvatarUrl,
      },
      likeCount: extras.postLikeCounts.get(row.postId) ?? 0,
      replyCount: extras.postReplyCounts.get(row.postId) ?? 0,
      viewerLiked: extras.viewerLikedPostIds.has(row.postId),
    }
  })

  const mappedCourses = courseRows.map((row) => ({
    id: row.id,
    postId: row.postId,
    type: 'course' as const,
    slug: row.slug,
    title: row.title,
    description: row.description ?? '',
    status: row.status,
    createdAt: toUnixSeconds(row.createdAt),
    publishedAt: toUnixSeconds(row.publishedAt),
    updatedAt: toUnixSeconds(row.updatedAt),
    creator: {
      id: row.authorId,
      displayName: row.authorDisplayName,
      username: row.authorUsername,
      avatarUrl: row.authorAvatarUrl,
    },
    likeCount: extras.postLikeCounts.get(row.postId) ?? 0,
    replyCount: extras.postReplyCounts.get(row.postId) ?? 0,
    viewerLiked: extras.viewerLikedPostIds.has(row.postId),
  }))

  const items = [...mappedPosts, ...mappedArticles, ...mappedAudio, ...mappedPhotography, ...mappedCourses]
    .sort((a, b) => {
      const aTime = a.type === 'article' || a.type === 'audio' || a.type === 'photography' || a.type === 'course' ? (a.publishedAt ?? a.createdAt ?? 0) : (a.createdAt ?? 0)
      const bTime = b.type === 'article' || b.type === 'audio' || b.type === 'photography' || b.type === 'course' ? (b.publishedAt ?? b.createdAt ?? 0) : (b.createdAt ?? 0)
      return bTime - aTime
    })
    .slice(0, 50)

  return c.json({ posts: mappedPosts, items })
})

// ── POST /subscribe ────────────────────────────────────────────────────────

feedRoutes.post('/subscribe', authMiddleware, zValidator('json', subscribeSchema, zodHook), async (c) => {
  const { creatorId } = c.req.valid('json')
  const db = createDb(c.env.DB)

  // Verify the target user exists and is a creator
  const creator = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, creatorId))
    .get()

  if (!creator || creator.role !== 'creator') {
    return notFound(c, 'Creator not found')
  }

  const subscriberId = c.var.user.id
  if (subscriberId === creatorId) return conflict(c, 'You cannot subscribe to yourself')

  try {
    await db.insert(follows).values({ followerId: subscriberId, followeeId: creatorId }).run()
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('unique')) {
      return conflict(c, 'Already subscribed to this creator')
    }
    throw err
  }

  let plan = await db
    .select()
    .from(membershipPlans)
    .where(eq(membershipPlans.creatorId, creatorId))
    .get()

  if (!plan) {
    const planId = crypto.randomUUID()
    await db
      .insert(membershipPlans)
      .values({
        id: planId,
        creatorId,
        freePermanentEnabled: true,
      })
      .run()
    plan = await db.select().from(membershipPlans).where(eq(membershipPlans.id, planId)).get()
  }

  if (plan) {
    await db
      .insert(subscriptionMemberships)
      .values({
        id: crypto.randomUUID(),
        creatorId,
        subscriberId,
        planId: plan.id,
        provider: 'internal',
        accessType: 'free',
        status: 'active',
      })
      .onConflictDoUpdate({
        target: [subscriptionMemberships.subscriberId, subscriptionMemberships.creatorId],
        set: {
          planId: plan.id,
          provider: 'internal',
          accessType: 'free',
          interval: null,
          status: 'active',
          trialEndsAt: null,
          updatedAt: new Date(),
        },
      })
      .run()
  }

  return c.json({ subscriberId, creatorId }, 201)
})
