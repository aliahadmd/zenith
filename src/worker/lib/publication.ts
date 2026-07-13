import { and, eq, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import {
  articles,
  audioCollections,
  audioItems,
  contentSchedules,
  courseLessons,
  courseModules,
  courses,
  photographyAlbums,
  photographyPhotos,
  pollOptions,
  postAttachments,
  postPolls,
  posts,
  users,
} from '../db/schema'
import { notifySubscribersOfContent } from './notifications'

export type ContentKind = 'post' | 'article' | 'audio' | 'photography' | 'course'

export class PublicationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable = false,
  ) {
    super(message)
    this.name = 'PublicationError'
  }
}

export async function getPublicationRecord(db: Db, postId: string) {
  return db
    .select({
      postId: posts.id,
      kind: posts.kind,
      postSlug: posts.slug,
      body: posts.body,
      postPublishedAt: posts.publishedAt,
      moderationStatus: posts.moderationStatus,
      creatorId: posts.authorId,
      creatorUsername: users.username,
      creatorAccountStatus: users.accountStatus,
      articleTitle: articles.title,
      articleMarkdown: articles.markdown,
      articleCoverR2Key: articles.coverR2Key,
      articleStatus: articles.status,
      audioId: audioItems.id,
      audioSlug: audioItems.slug,
      audioTitle: audioItems.title,
      audioStatus: audioItems.status,
      audioR2Key: audioItems.audioR2Key,
      audioCoverR2Key: audioItems.coverR2Key,
      audioCollectionStatus: audioCollections.status,
      audioCollectionCoverR2Key: audioCollections.coverR2Key,
      photographyId: photographyAlbums.id,
      photographySlug: photographyAlbums.slug,
      photographyTitle: photographyAlbums.title,
      photographyStatus: photographyAlbums.status,
      photographyCoverPhotoId: photographyAlbums.coverPhotoId,
      courseId: courses.id,
      courseSlug: courses.slug,
      courseTitle: courses.title,
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

export type PublicationRecord = NonNullable<Awaited<ReturnType<typeof getPublicationRecord>>>

export function publicationTitle(record: PublicationRecord) {
  if (record.kind === 'article') return record.articleTitle || 'Untitled article'
  if (record.kind === 'audio') return record.audioTitle || 'Untitled audio'
  if (record.kind === 'photography') return record.photographyTitle || 'Untitled album'
  if (record.kind === 'course') return record.courseTitle || 'Untitled course'
  return record.body.trim() || 'Post'
}

export function publicationTargetUrl(record: PublicationRecord) {
  if (record.kind === 'article') return `/u/${record.creatorUsername}/article/${record.postSlug}`
  if (record.kind === 'audio') return `/u/${record.creatorUsername}/audio/${record.audioSlug ?? record.postSlug}`
  if (record.kind === 'photography') return `/u/${record.creatorUsername}/photography/${record.photographySlug ?? record.postSlug}`
  if (record.kind === 'course') return `/u/${record.creatorUsername}/course/${record.courseSlug ?? record.postSlug}`
  return `/u/${record.creatorUsername}/post/${record.postSlug}`
}

export function publicationEntityId(record: PublicationRecord) {
  if (record.kind === 'audio') return record.audioId ?? record.postId
  if (record.kind === 'photography') return record.photographyId ?? record.postId
  if (record.kind === 'course') return record.courseId ?? record.postId
  return record.postId
}

export function isRecordPublished(record: PublicationRecord) {
  if (!record.postPublishedAt) return false
  if (record.kind === 'article') return record.articleStatus === 'published'
  if (record.kind === 'audio') return record.audioStatus === 'published'
  if (record.kind === 'photography') return record.photographyStatus === 'published'
  if (record.kind === 'course') return record.courseStatus === 'published'
  return true
}

export async function validatePublishableContent(db: Db, record: PublicationRecord) {
  if (record.creatorAccountStatus !== 'active') {
    throw new PublicationError('account_suspended', 'Your account must be active before scheduled content can publish.')
  }
  if (record.moderationStatus !== 'active') {
    throw new PublicationError('content_moderated', 'This content must be restored by the moderation team before it can publish.')
  }

  if (record.kind === 'post') {
    const [attachment, poll] = await Promise.all([
      db.select({ id: postAttachments.id }).from(postAttachments).where(eq(postAttachments.postId, record.postId)).get(),
      db.select({ id: postPolls.id }).from(postPolls).where(eq(postPolls.postId, record.postId)).get(),
    ])
    if (!record.body.trim() && !attachment && !poll) {
      throw new PublicationError('validation_failed', 'Add post text, images, or a poll before publishing.')
    }
    if (poll) {
      const count = await db.select({ count: sql<number>`count(*)` }).from(pollOptions).where(eq(pollOptions.pollId, poll.id)).get()
      if (Number(count?.count ?? 0) < 2) throw new PublicationError('validation_failed', 'Polls need at least two options before publishing.')
    }
    return
  }

  if (record.kind === 'article') {
    if (!record.articleTitle?.trim() || !record.articleMarkdown?.trim() || !record.articleCoverR2Key) {
      throw new PublicationError('validation_failed', 'Published articles need a title, article body, and cover photo.')
    }
    return
  }

  if (record.kind === 'audio') {
    if (!record.audioR2Key) throw new PublicationError('validation_failed', 'Published audio needs an audio file.')
    if (!record.audioCoverR2Key && !record.audioCollectionCoverR2Key) {
      throw new PublicationError('validation_failed', 'Published audio needs an item cover or collection cover.')
    }
    if (record.audioCollectionStatus !== 'published') {
      throw new PublicationError('parent_unpublished', 'Publish the parent album or podcast before this audio item can publish.')
    }
    return
  }

  if (record.kind === 'photography') {
    if (!record.photographyId || !record.photographyCoverPhotoId) {
      throw new PublicationError('validation_failed', 'Published albums need a cover photo.')
    }
    const [cover, photoCount] = await Promise.all([
      db
        .select({ id: photographyPhotos.id })
        .from(photographyPhotos)
        .where(and(
          eq(photographyPhotos.id, record.photographyCoverPhotoId),
          eq(photographyPhotos.albumId, record.photographyId),
          eq(photographyPhotos.status, 'published'),
        ))
        .get(),
      db
        .select({ count: sql<number>`count(*)` })
        .from(photographyPhotos)
        .where(and(eq(photographyPhotos.albumId, record.photographyId), eq(photographyPhotos.status, 'published')))
        .get(),
    ])
    if (!cover || Number(photoCount?.count ?? 0) === 0) {
      throw new PublicationError('validation_failed', 'Published albums need at least one published photo and a published cover photo.')
    }
    return
  }

  if (!record.courseId) throw new PublicationError('validation_failed', 'Course not found.')
  const [moduleCount, lessonCount] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(courseModules).where(eq(courseModules.courseId, record.courseId)).get(),
    db
      .select({ count: sql<number>`count(*)` })
      .from(courseLessons)
      .where(and(eq(courseLessons.courseId, record.courseId), eq(courseLessons.status, 'published')))
      .get(),
  ])
  if (Number(moduleCount?.count ?? 0) === 0) {
    throw new PublicationError('validation_failed', 'Add at least one module before publishing the course.')
  }
  if (Number(lessonCount?.count ?? 0) === 0) {
    throw new PublicationError('validation_failed', 'Add and publish at least one lesson before publishing the course.')
  }
}

export async function publishContent(
  db: Db,
  env: Env,
  postId: string,
  options: { now?: Date; origin?: string } = {},
) {
  const record = await getPublicationRecord(db, postId)
  if (!record) throw new PublicationError('not_found', 'Content not found.')

  if (isRecordPublished(record)) {
    await db.update(contentSchedules).set({
      status: 'published',
      publishedAt: record.postPublishedAt,
      processingStartedAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      updatedAt: new Date(),
    }).where(eq(contentSchedules.postId, postId)).run()
    return { record, alreadyPublished: true }
  }

  await validatePublishableContent(db, record)
  const now = options.now ?? new Date()
  const postUpdate = db.update(posts).set({ publishedAt: now }).where(eq(posts.id, postId))
  const scheduleUpdate = db.update(contentSchedules).set({
    status: 'published',
    publishedAt: now,
    processingStartedAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    updatedAt: now,
  }).where(eq(contentSchedules.postId, postId))

  if (record.kind === 'article') {
    await db.batch([
      db.update(articles).set({ status: 'published', publishedAt: now, updatedAt: now }).where(eq(articles.postId, postId)),
      postUpdate,
      scheduleUpdate,
    ])
  } else if (record.kind === 'audio') {
    await db.batch([
      db.update(audioItems).set({ status: 'published', publishedAt: now, updatedAt: now }).where(eq(audioItems.postId, postId)),
      postUpdate,
      scheduleUpdate,
    ])
  } else if (record.kind === 'photography') {
    await db.batch([
      db.update(photographyAlbums).set({ status: 'published', publishedAt: now, updatedAt: now }).where(eq(photographyAlbums.postId, postId)),
      postUpdate,
      scheduleUpdate,
    ])
  } else if (record.kind === 'course') {
    await db.batch([
      db.update(courses).set({ status: 'published', publishedAt: now, updatedAt: now }).where(eq(courses.postId, postId)),
      postUpdate,
      scheduleUpdate,
    ])
  } else {
    await db.batch([postUpdate, scheduleUpdate])
  }

  try {
    await notifySubscribersOfContent(db, env, {
      creatorId: record.creatorId,
      contentType: record.kind as ContentKind,
      entityId: publicationEntityId(record),
      title: publicationTitle(record),
      targetUrl: publicationTargetUrl(record),
    }, options.origin)
  } catch (error) {
    console.error(JSON.stringify({ event: 'content_publish_notification_failed', postId, error: error instanceof Error ? error.message : String(error) }))
  }

  console.log(JSON.stringify({ event: 'content_published', postId, kind: record.kind, publishedAt: now.toISOString() }))
  return { record: { ...record, postPublishedAt: now }, alreadyPublished: false }
}
