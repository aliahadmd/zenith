import { and, asc, eq, lte, sql } from 'drizzle-orm'
import { createDb, type Db } from '../db/client'
import { contentSchedules } from '../db/schema'
import { notifyCreatorOfScheduleFailure } from './notifications'
import {
  getPublicationRecord,
  PublicationError,
  publicationTitle,
  publishContent,
} from './publication'

const MAX_ATTEMPTS = 3
const STALE_PROCESSING_MS = 5 * 60 * 1000
const DUE_BATCH_SIZE = 20

async function failSchedule(
  db: Db,
  env: Env,
  input: { postId: string; creatorId: string; revision: number; code: string; message: string },
  now: Date,
) {
  await db.update(contentSchedules).set({
    status: 'failed',
    processingStartedAt: null,
    lastErrorCode: input.code,
    lastErrorMessage: input.message.slice(0, 500),
    updatedAt: now,
  }).where(eq(contentSchedules.postId, input.postId)).run()

  const record = await getPublicationRecord(db, input.postId)
  await notifyCreatorOfScheduleFailure(db, env, {
    creatorId: input.creatorId,
    postId: input.postId,
    revision: input.revision,
    title: record ? publicationTitle(record) : 'Content',
    reason: input.message,
  }, env.NOTIFICATION_EMAIL_BASE_URL || undefined)

  console.error(JSON.stringify({ event: 'content_schedule_failed', postId: input.postId, code: input.code, attemptCount: MAX_ATTEMPTS }))
}

export async function processDueSchedules(env: Env, scheduledTime = Date.now()) {
  const db = createDb(env.DB)
  const now = new Date(scheduledTime)
  const staleBefore = new Date(scheduledTime - STALE_PROCESSING_MS)

  await db.update(contentSchedules).set({
    status: 'pending',
    processingStartedAt: null,
    nextAttemptAt: now,
    updatedAt: now,
  }).where(and(
    eq(contentSchedules.status, 'processing'),
    lte(contentSchedules.processingStartedAt, staleBefore),
  )).run()

  const due = await db
    .select({ postId: contentSchedules.postId })
    .from(contentSchedules)
    .where(and(eq(contentSchedules.status, 'pending'), lte(contentSchedules.nextAttemptAt, now)))
    .orderBy(asc(contentSchedules.nextAttemptAt))
    .limit(DUE_BATCH_SIZE)
    .all()

  let published = 0
  let retried = 0
  let failed = 0

  for (const item of due) {
    const claimed = await db
      .update(contentSchedules)
      .set({
        status: 'processing',
        processingStartedAt: now,
        attemptCount: sql`${contentSchedules.attemptCount} + 1`,
        updatedAt: now,
      })
      .where(and(
        eq(contentSchedules.postId, item.postId),
        eq(contentSchedules.status, 'pending'),
        lte(contentSchedules.nextAttemptAt, now),
      ))
      .returning({
        postId: contentSchedules.postId,
        creatorId: contentSchedules.creatorId,
        revision: contentSchedules.revision,
        attemptCount: contentSchedules.attemptCount,
      })
      .get()

    if (!claimed) continue

    try {
      await publishContent(db, env, claimed.postId, {
        now,
        origin: env.NOTIFICATION_EMAIL_BASE_URL || undefined,
      })
      published += 1
    } catch (error) {
      const deterministic = error instanceof PublicationError && !error.retryable
      const message = error instanceof Error ? error.message : 'Scheduled publication failed unexpectedly.'
      const code = error instanceof PublicationError ? error.code : 'infrastructure_error'

      if (deterministic || claimed.attemptCount >= MAX_ATTEMPTS) {
        await failSchedule(db, env, { ...claimed, code, message }, now)
        failed += 1
        continue
      }

      const delayMs = claimed.attemptCount === 1 ? 60_000 : 5 * 60_000
      await db.update(contentSchedules).set({
        status: 'pending',
        processingStartedAt: null,
        nextAttemptAt: new Date(scheduledTime + delayMs),
        lastErrorCode: code,
        lastErrorMessage: message.slice(0, 500),
        updatedAt: now,
      }).where(eq(contentSchedules.postId, claimed.postId)).run()
      retried += 1
      console.warn(JSON.stringify({ event: 'content_schedule_retry', postId: claimed.postId, attemptCount: claimed.attemptCount, code }))
    }
  }

  console.log(JSON.stringify({ event: 'content_schedule_tick', due: due.length, published, retried, failed, scheduledTime }))
  return { due: due.length, published, retried, failed }
}
