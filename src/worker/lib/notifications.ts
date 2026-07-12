import { and, eq, gt, or } from 'drizzle-orm'
import type { Db } from '../db/client'
import {
  notificationPreferences,
  notifications,
  subscriptionMemberships,
  users,
  type Notification,
  type NotificationPreference,
} from '../db/schema'
import { absoluteEmailUrl, hasTransactionalEmail, sendTransactionalEmail } from './email'

export type NotificationCategory = 'content' | 'interaction' | 'subscription' | 'account'

export type NotificationType =
  | 'content_published'
  | 'reply_created'
  | 'post_liked'
  | 'subscription_started'
  | 'subscription_active'
  | 'subscription_status_changed'
  | 'payment_failed'
  | 'creator_application_approved'
  | 'creator_application_rejected'
  | 'content_hidden'
  | 'content_restored'
  | 'account_suspended'
  | 'account_restored'

export type NotificationPreferencesInput = {
  emailEnabled: boolean
  contentEmailEnabled: boolean
  interactionEmailEnabled: boolean
  subscriptionEmailEnabled: boolean
}

type NotificationInput = {
  recipientId: string
  actorId?: string | null
  type: NotificationType
  category: NotificationCategory
  title: string
  body: string
  targetUrl?: string | null
  entityType?: string | null
  entityId?: string | null
  metadata?: Record<string, unknown> | null
  dedupeKey: string
  forceEmail?: boolean
}

type ContentNotificationInput = {
  creatorId: string
  contentType: 'post' | 'article' | 'audio' | 'photography' | 'course'
  entityId: string
  title: string
  targetUrl: string
}

type MembershipNotificationInput = {
  creatorId: string
  subscriberId: string
  membershipId: string
  accessType: 'free' | 'trial' | 'paid'
  status: string
  dedupeKey: string
}

const DEFAULT_PREFERENCES: NotificationPreferencesInput = {
  emailEnabled: true,
  contentEmailEnabled: true,
  interactionEmailEnabled: false,
  subscriptionEmailEnabled: true,
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000)
}

function preferenceAllowsEmail(preferences: NotificationPreferencesInput, category: NotificationCategory) {
  if (category === 'account') return true
  if (!preferences.emailEnabled) return false
  if (category === 'content') return preferences.contentEmailEnabled
  if (category === 'interaction') return preferences.interactionEmailEnabled
  return preferences.subscriptionEmailEnabled
}

function serializePreferences(row: NotificationPreference | undefined | null): NotificationPreferencesInput {
  return {
    emailEnabled: row?.emailEnabled ?? DEFAULT_PREFERENCES.emailEnabled,
    contentEmailEnabled: row?.contentEmailEnabled ?? DEFAULT_PREFERENCES.contentEmailEnabled,
    interactionEmailEnabled: row?.interactionEmailEnabled ?? DEFAULT_PREFERENCES.interactionEmailEnabled,
    subscriptionEmailEnabled: row?.subscriptionEmailEnabled ?? DEFAULT_PREFERENCES.subscriptionEmailEnabled,
  }
}

function emailText(body: string, url: string | null) {
  return url ? `${body}\n\nOpen in Zenith: ${url}` : body
}

async function sendNotificationEmail(env: Env, input: {
  recipientEmail: string
  title: string
  body: string
  targetUrl: string | null
  origin?: string
}) {
  const url = absoluteEmailUrl(env, input.targetUrl, input.origin)
  await sendTransactionalEmail(env, {
    to: input.recipientEmail,
    subject: input.title,
    text: emailText(input.body, url),
  })
}

export async function getNotificationPreferences(db: Db, userId: string) {
  const row = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .get()

  if (row) return serializePreferences(row)

  await db
    .insert(notificationPreferences)
    .values({ userId, ...DEFAULT_PREFERENCES })
    .onConflictDoNothing()
    .run()

  return DEFAULT_PREFERENCES
}

export async function updateNotificationPreferences(
  db: Db,
  userId: string,
  values: NotificationPreferencesInput,
) {
  await db
    .insert(notificationPreferences)
    .values({ userId, ...values })
    .onConflictDoUpdate({
      target: notificationPreferences.userId,
      set: { ...values, updatedAt: new Date() },
    })
    .run()

  return getNotificationPreferences(db, userId)
}

export async function createNotification(
  db: Db,
  env: Env,
  input: NotificationInput,
  origin?: string,
): Promise<Notification | null> {
  if (input.actorId && input.actorId === input.recipientId) return null

  const existing = await db
    .select()
    .from(notifications)
    .where(eq(notifications.dedupeKey, input.dedupeKey))
    .get()
  if (existing) return existing

  const [recipient, preferences] = await Promise.all([
    db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, input.recipientId))
      .get(),
    getNotificationPreferences(db, input.recipientId),
  ])

  if (!recipient) return null

  const shouldEmail = (input.forceEmail || preferenceAllowsEmail(preferences, input.category)) && hasTransactionalEmail(env)
  const emailStatus = shouldEmail ? 'pending' : 'not_applicable'

  await db
    .insert(notifications)
    .values({
      recipientId: input.recipientId,
      actorId: input.actorId ?? null,
      type: input.type,
      category: input.category,
      title: input.title,
      body: input.body,
      targetUrl: input.targetUrl ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      dedupeKey: input.dedupeKey,
      emailStatus,
    })
    .onConflictDoNothing()
    .run()

  const created = await db
    .select()
    .from(notifications)
    .where(eq(notifications.dedupeKey, input.dedupeKey))
    .get()

  if (!created || !shouldEmail) return created ?? null

  try {
    await sendNotificationEmail(env, {
      recipientEmail: recipient.email,
      title: input.title,
      body: input.body,
      targetUrl: input.targetUrl ?? null,
      origin,
    })
    await db
      .update(notifications)
      .set({ emailStatus: 'sent', emailError: null, emailSentAt: nowSeconds() })
      .where(eq(notifications.id, created.id))
      .run()
  } catch (error) {
    await db
      .update(notifications)
      .set({
        emailStatus: 'failed',
        emailError: error instanceof Error ? error.message.slice(0, 500) : 'Email delivery failed',
      })
      .where(eq(notifications.id, created.id))
      .run()
  }

  return await db.select().from(notifications).where(eq(notifications.id, created.id)).get() ?? null
}

async function safeCreateNotification(db: Db, env: Env, input: NotificationInput, origin?: string) {
  try {
    await createNotification(db, env, input, origin)
  } catch (error) {
    console.error('Notification side effect failed:', error)
  }
}

async function getUserSummary(db: Db, userId: string) {
  return db
    .select({
      id: users.id,
      displayName: users.displayName,
      username: users.username,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, userId))
    .get()
}

export async function notifySubscribersOfContent(
  db: Db,
  env: Env,
  input: ContentNotificationInput,
  origin?: string,
) {
  const creator = await getUserSummary(db, input.creatorId)
  if (!creator) return

  const rows = await db
    .select({ subscriberId: subscriptionMemberships.subscriberId })
    .from(subscriptionMemberships)
    .where(and(
      eq(subscriptionMemberships.creatorId, input.creatorId),
      or(
        eq(subscriptionMemberships.status, 'active'),
        and(eq(subscriptionMemberships.status, 'trialing'), gt(subscriptionMemberships.trialEndsAt, nowSeconds())),
      ),
    ))
    .all()

  const label = input.contentType === 'post'
    ? 'post'
    : input.contentType === 'photography'
      ? 'photo album'
      : input.contentType === 'course'
        ? 'course'
      : input.contentType
  const body = `${creator.displayName} published a new ${label}: ${input.title}`

  for (const row of rows) {
    await safeCreateNotification(db, env, {
      recipientId: row.subscriberId,
      actorId: input.creatorId,
      type: 'content_published',
      category: 'content',
      title: `New ${label} from ${creator.displayName}`,
      body,
      targetUrl: input.targetUrl,
      entityType: input.contentType,
      entityId: input.entityId,
      metadata: { contentType: input.contentType },
      dedupeKey: `content:${input.contentType}:${input.entityId}:recipient:${row.subscriberId}`,
    }, origin)
  }
}

export async function notifyCreatorOfReply(
  db: Db,
  env: Env,
  input: {
    creatorId: string
    actorId: string
    postId: string
    replyId: string
    targetUrl: string
  },
  origin?: string,
) {
  const actor = await getUserSummary(db, input.actorId)
  if (!actor) return
  await safeCreateNotification(db, env, {
    recipientId: input.creatorId,
    actorId: input.actorId,
    type: 'reply_created',
    category: 'interaction',
    title: `${actor.displayName} replied to your content`,
    body: `${actor.displayName} added a reply to your content.`,
    targetUrl: input.targetUrl,
    entityType: 'reply',
    entityId: input.replyId,
    metadata: { postId: input.postId },
    dedupeKey: `reply:${input.replyId}:creator:${input.creatorId}`,
  }, origin)
}

export async function notifyCreatorOfPostLike(
  db: Db,
  env: Env,
  input: {
    creatorId: string
    actorId: string
    postId: string
    targetUrl: string
  },
  origin?: string,
) {
  const actor = await getUserSummary(db, input.actorId)
  if (!actor) return
  await safeCreateNotification(db, env, {
    recipientId: input.creatorId,
    actorId: input.actorId,
    type: 'post_liked',
    category: 'interaction',
    title: `${actor.displayName} liked your content`,
    body: `${actor.displayName} liked your content.`,
    targetUrl: input.targetUrl,
    entityType: 'post',
    entityId: input.postId,
    metadata: null,
    dedupeKey: `post-like:${input.postId}:actor:${input.actorId}`,
  }, origin)
}

export async function notifyMembershipActivated(
  db: Db,
  env: Env,
  input: MembershipNotificationInput,
  origin?: string,
) {
  const [creator, subscriber] = await Promise.all([
    getUserSummary(db, input.creatorId),
    getUserSummary(db, input.subscriberId),
  ])
  if (!creator || !subscriber) return

  const accessLabel = input.accessType === 'trial' ? 'trial' : input.accessType === 'paid' ? 'paid membership' : 'free membership'

  await safeCreateNotification(db, env, {
    recipientId: input.creatorId,
    actorId: input.subscriberId,
    type: 'subscription_started',
    category: 'subscription',
    title: `${subscriber.displayName} subscribed`,
    body: `${subscriber.displayName} started a ${accessLabel}.`,
    targetUrl: '/studio/subscriptions',
    entityType: 'membership',
    entityId: input.membershipId,
    metadata: { accessType: input.accessType, status: input.status },
    dedupeKey: `creator:${input.dedupeKey}`,
  }, origin)

  await safeCreateNotification(db, env, {
    recipientId: input.subscriberId,
    actorId: input.creatorId,
    type: 'subscription_active',
    category: 'subscription',
    title: `Subscription active for ${creator.displayName}`,
    body: `Your ${accessLabel} for ${creator.displayName} is active.`,
    targetUrl: `/u/${creator.username}`,
    entityType: 'membership',
    entityId: input.membershipId,
    metadata: { accessType: input.accessType, status: input.status },
    dedupeKey: `subscriber:${input.dedupeKey}`,
  }, origin)
}

export async function notifySubscriptionStatusChanged(
  db: Db,
  env: Env,
  input: {
    creatorId: string
    subscriberId: string
    membershipId: string
    status: string
    dedupeKey: string
  },
  origin?: string,
) {
  const creator = await getUserSummary(db, input.creatorId)
  if (!creator) return
  await safeCreateNotification(db, env, {
    recipientId: input.subscriberId,
    actorId: input.creatorId,
    type: input.status === 'past_due' ? 'payment_failed' : 'subscription_status_changed',
    category: 'subscription',
    title: input.status === 'past_due' ? `Payment issue for ${creator.displayName}` : `Subscription update for ${creator.displayName}`,
    body: `Your subscription to ${creator.displayName} is now ${input.status.replaceAll('_', ' ')}.`,
    targetUrl: `/u/${creator.username}`,
    entityType: 'membership',
    entityId: input.membershipId,
    metadata: { status: input.status },
    dedupeKey: input.dedupeKey,
  }, origin)
}
