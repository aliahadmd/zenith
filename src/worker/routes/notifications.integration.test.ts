import { beforeAll, describe, expect, it } from 'vitest'
import { env, SELF } from 'cloudflare:test'
import migration0 from '../../../drizzle/0000_overrated_nitro.sql?raw'
import migration1 from '../../../drizzle/0001_add-creator-applications.sql?raw'
import migration2 from '../../../drizzle/0002_better_auth.sql?raw'
import migration3 from '../../../drizzle/0003_creator_subscriptions.sql?raw'
import migration4 from '../../../drizzle/0004_feed_interactions.sql?raw'
import migration5 from '../../../drizzle/0005_articles.sql?raw'
import migration6 from '../../../drizzle/0006_creator_profile_tabs.sql?raw'
import migration7 from '../../../drizzle/0007_audio.sql?raw'
import migration8 from '../../../drizzle/0008_photography.sql?raw'
import migration9 from '../../../drizzle/0009_notifications.sql?raw'
import migration10 from '../../../drizzle/0010_courses.sql?raw'
import migration11 from '../../../drizzle/0011_admin_dashboard.sql?raw'
import migration12 from '../../../drizzle/0012_threaded_discussions.sql?raw'
import migration13 from '../../../drizzle/0013_saved_library.sql?raw'
import migration14 from '../../../drizzle/0014_content_scheduling.sql?raw'
import migration15 from '../../../drizzle/0015_creator_discovery.sql?raw'
import { createDb } from '../db/client'
import { notifications, users } from '../db/schema'
import { storeSignInOtp } from '../lib/auth-otp'
import {
  createNotification,
  updateNotificationPreferences,
} from '../lib/notifications'

async function applyMigration(sql: string) {
  const statements = sql
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean)

  for (const statement of statements) {
    await env.DB.prepare(statement).run()
  }
}

function getCookieHeader(response: Response): string {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] }
  const setCookies = headers.getSetCookie?.() ?? []
  const cookies = setCookies.length > 0
    ? setCookies
    : response.headers.get('set-cookie')?.split(/,(?=\s*[^;,]+=[^;,]+)/) ?? []

  return cookies.map((cookie) => cookie.split(';')[0]).join('; ')
}

async function registerUser() {
  const email = `notifications-${crypto.randomUUID()}@example.com`
  const otp = '123456'
  await storeSignInOtp(createDb(env.DB), email, otp)
  const response = await SELF.fetch('https://example.com/api/auth/otp/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp }),
  })
  expect(response.status).toBe(200)
  const cookie = getCookieHeader(response)
  const meResponse = await SELF.fetch('https://example.com/api/auth/me', {
    headers: { Cookie: cookie },
  })
  const user = await meResponse.json() as { id: string; username: string }
  return { cookie, user }
}

describe('notifications', () => {
  beforeAll(async () => {
    await applyMigration(migration0)
    await applyMigration(migration1)
    await applyMigration(migration2)
    await applyMigration(migration3)
    await applyMigration(migration4)
    await applyMigration(migration5)
    await applyMigration(migration6)
    await applyMigration(migration7)
    await applyMigration(migration8)
    await applyMigration(migration9)
    await applyMigration(migration10)
    await applyMigration(migration11)
    await applyMigration(migration12)
    await applyMigration(migration13)
    await applyMigration(migration14)
    await applyMigration(migration15)
  })

  it('dedupes notifications and respects disabled email preferences', async () => {
    const db = createDb(env.DB)
    const recipientId = crypto.randomUUID()
    const actorId = crypto.randomUUID()
    await db.insert(users).values([
      {
        id: recipientId,
        email: `recipient-${recipientId}@example.com`,
        passwordHash: 'test',
        role: 'subscriber',
        displayName: 'Recipient',
        username: `r${recipientId.replaceAll('-', '').slice(0, 8)}`,
      },
      {
        id: actorId,
        email: `actor-${actorId}@example.com`,
        passwordHash: 'test',
        role: 'creator',
        displayName: 'Actor',
        username: `a${actorId.replaceAll('-', '').slice(0, 8)}`,
      },
    ]).run()
    await updateNotificationPreferences(db, recipientId, {
      emailEnabled: false,
      contentEmailEnabled: true,
      interactionEmailEnabled: true,
      subscriptionEmailEnabled: true,
    })

    const input = {
      recipientId,
      actorId,
      type: 'content_published' as const,
      category: 'content' as const,
      title: 'New post',
      body: 'A creator published a new post.',
      targetUrl: '/feed',
      entityType: 'post',
      entityId: 'post-1',
      dedupeKey: `test-dedupe-${recipientId}`,
    }
    const first = await createNotification(db, env, input, 'https://example.com')
    const second = await createNotification(db, env, input, 'https://example.com')
    const rows = await db.select().from(notifications).all()

    expect(first?.id).toBe(second?.id)
    expect(rows.filter((row) => row.dedupeKey === input.dedupeKey)).toHaveLength(1)
    expect(first?.emailStatus).toBe('not_applicable')
  })

  it('lists unread notifications and marks them read for the recipient only', async () => {
    const { cookie, user } = await registerUser()
    const other = await registerUser()
    const db = createDb(env.DB)
    const notificationId = crypto.randomUUID()
    await db.insert(notifications).values({
      id: notificationId,
      recipientId: user.id,
      type: 'subscription_active',
      category: 'subscription',
      title: 'Subscription active',
      body: 'Your subscription is active.',
      targetUrl: '/feed',
      entityType: 'membership',
      entityId: 'membership-1',
      dedupeKey: `route-${notificationId}`,
    }).run()

    const unreadResponse = await SELF.fetch('https://example.com/api/notifications/unread-count', {
      headers: { Cookie: cookie },
    })
    expect(await unreadResponse.json()).toEqual({ count: 1 })

    const forbiddenRead = await SELF.fetch(`https://example.com/api/notifications/${notificationId}/read`, {
      method: 'PATCH',
      headers: { Cookie: other.cookie },
    })
    expect(forbiddenRead.status).toBe(404)

    const readResponse = await SELF.fetch(`https://example.com/api/notifications/${notificationId}/read`, {
      method: 'PATCH',
      headers: { Cookie: cookie },
    })
    expect(readResponse.status).toBe(200)

    const listResponse = await SELF.fetch('https://example.com/api/notifications?filter=unread', {
      headers: { Cookie: cookie },
    })
    const listJson = await listResponse.json() as { notifications: unknown[] }
    expect(listJson.notifications).toHaveLength(0)
  })

  it('updates notification preferences', async () => {
    const { cookie } = await registerUser()
    const response = await SELF.fetch('https://example.com/api/notifications/preferences', {
      method: 'PUT',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        emailEnabled: true,
        contentEmailEnabled: false,
        interactionEmailEnabled: true,
        subscriptionEmailEnabled: false,
      }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      preferences: {
        emailEnabled: true,
        contentEmailEnabled: false,
        interactionEmailEnabled: true,
        subscriptionEmailEnabled: false,
      },
    })
  })
})
