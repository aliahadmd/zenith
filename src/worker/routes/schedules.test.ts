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
import { storeSignInOtp } from '../lib/auth-otp'
import { processDueSchedules } from '../lib/scheduling'
import { createDb } from '../db/client'

async function apply(source: string) {
  for (const statement of source.split('--> statement-breakpoint').map((value) => value.trim()).filter(Boolean)) await env.DB.prepare(statement).run()
}

function cookie(response: Response) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] }
  return (headers.getSetCookie?.() ?? [response.headers.get('set-cookie') ?? '']).map((value) => value.split(';')[0]).filter(Boolean).join('; ')
}

async function signIn(email: string) {
  await storeSignInOtp(createDb(env.DB), email, '123456')
  const response = await SELF.fetch('https://example.com/api/auth/otp/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, otp: '123456' }),
  })
  return { cookie: cookie(response), user: await response.json() as { id: string; username: string } }
}

function json(cookieHeader: string, body?: unknown, method = 'POST') {
  return { method, headers: { Cookie: cookieHeader, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }
}

describe('content scheduling routes', () => {
  beforeAll(async () => {
    for (const migration of [migration0, migration1, migration2, migration3, migration4, migration5, migration6, migration7, migration8, migration9, migration10, migration11, migration12, migration13, migration14, migration15]) await apply(migration)
  })

  it('keeps scheduled posts private, publishes the latest draft, and notifies at release time', async () => {
    const creator = await signIn(`schedule-creator-${crypto.randomUUID()}@example.com`)
    const member = await signIn(`schedule-member-${crypto.randomUUID()}@example.com`)
    const outsider = await signIn(`schedule-outsider-${crypto.randomUUID()}@example.com`)
    await env.DB.prepare("UPDATE users SET role = 'creator' WHERE id = ?").bind(creator.user.id).run()
    await env.DB.prepare("INSERT INTO subscription_memberships (id, creator_id, subscriber_id, provider, access_type, status) VALUES (?, ?, ?, 'internal', 'free', 'active')")
      .bind(crypto.randomUUID(), creator.user.id, member.user.id).run()

    const dueAt = new Date(Date.now() + 2 * 60_000)
    const created = await SELF.fetch('https://example.com/api/posts', json(creator.cookie, { body: 'Original scheduled post', scheduledFor: dueAt.toISOString() }))
    expect(created.status).toBe(201)
    const post = await created.json() as { id: string; slug: string }

    const privateDetail = await SELF.fetch(`https://example.com/api/posts/by-slug/${creator.user.username}/${post.slug}`, { headers: { Cookie: member.cookie } })
    expect(privateDetail.status).toBe(404)
    const preReleaseNotifications = await env.DB.prepare("SELECT count(*) AS count FROM notifications WHERE type = 'content_published' AND actor_id = ?").bind(creator.user.id).first<{ count: number }>()
    expect(preReleaseNotifications?.count).toBe(0)

    const upcoming = await SELF.fetch('https://example.com/api/schedules?status=upcoming', { headers: { Cookie: creator.cookie } })
    await expect(upcoming.json()).resolves.toMatchObject({ total: 1, items: [{ postId: post.id, status: 'pending', contentType: 'post' }] })

    const outsiderUpdate = await SELF.fetch(`https://example.com/api/schedules/${post.id}`, json(outsider.cookie, { scheduledFor: new Date(Date.now() + 4 * 60_000).toISOString() }, 'PUT'))
    expect(outsiderUpdate.status).toBe(403)
    const tooSoon = await SELF.fetch(`https://example.com/api/schedules/${post.id}`, json(creator.cookie, { scheduledFor: new Date(Date.now() + 10_000).toISOString() }, 'PUT'))
    expect(tooSoon.status).toBe(422)

    const edited = await SELF.fetch(`https://example.com/api/posts/${post.id}`, json(creator.cookie, { body: 'Latest scheduled post' }, 'PATCH'))
    expect(edited.status).toBe(200)

    const result = await processDueSchedules(env, dueAt.getTime() + 1_000)
    expect(result.published).toBe(1)
    const released = await SELF.fetch(`https://example.com/api/posts/by-slug/${creator.user.username}/${post.slug}`, { headers: { Cookie: member.cookie } })
    expect(released.status).toBe(200)
    await expect(released.json()).resolves.toMatchObject({ post: { body: 'Latest scheduled post', publishedAt: expect.any(Number) } })

    const history = await SELF.fetch('https://example.com/api/schedules?status=history', { headers: { Cookie: creator.cookie } })
    await expect(history.json()).resolves.toMatchObject({ total: 1, items: [{ postId: post.id, status: 'published' }] })
    const notification = await env.DB.prepare("SELECT count(*) AS count FROM notifications WHERE type = 'content_published' AND actor_id = ? AND recipient_id = ?").bind(creator.user.id, member.user.id).first<{ count: number }>()
    expect(notification?.count).toBe(1)
  })

  it('reschedules and cancels draft content idempotently', async () => {
    const creator = await signIn(`schedule-cancel-${crypto.randomUUID()}@example.com`)
    await env.DB.prepare("UPDATE users SET role = 'creator' WHERE id = ?").bind(creator.user.id).run()
    const firstTime = new Date(Date.now() + 2 * 60_000)
    const created = await SELF.fetch('https://example.com/api/posts', json(creator.cookie, { body: 'Cancel me', scheduledFor: firstTime.toISOString() }))
    const post = await created.json() as { id: string }
    const secondTime = new Date(Date.now() + 5 * 60_000)
    const rescheduled = await SELF.fetch(`https://example.com/api/schedules/${post.id}`, json(creator.cookie, { scheduledFor: secondTime.toISOString() }, 'PUT'))
    await expect(rescheduled.json()).resolves.toMatchObject({ schedule: { revision: 2, status: 'pending' } })
    const canceled = await SELF.fetch(`https://example.com/api/schedules/${post.id}`, { method: 'DELETE', headers: { Cookie: creator.cookie } })
    await expect(canceled.json()).resolves.toMatchObject({ canceled: true, schedule: { status: 'canceled' } })
    const repeated = await SELF.fetch(`https://example.com/api/schedules/${post.id}`, { method: 'DELETE', headers: { Cookie: creator.cookie } })
    expect(repeated.status).toBe(200)
  })

  it('fails deterministic audio releases when the parent collection is unpublished', async () => {
    const creator = await signIn(`schedule-audio-${crypto.randomUUID()}@example.com`)
    await env.DB.prepare("UPDATE users SET role = 'creator' WHERE id = ?").bind(creator.user.id).run()
    const postId = crypto.randomUUID()
    const collectionId = crypto.randomUUID()
    const itemId = crypto.randomUUID()
    await env.DB.prepare("INSERT INTO posts (id, author_id, kind, slug, body, published_at) VALUES (?, ?, 'audio', 'scheduled-audio', 'Audio', NULL)").bind(postId, creator.user.id).run()
    await env.DB.prepare("INSERT INTO audio_collections (id, creator_id, kind, slug, title, status, cover_r2_key) VALUES (?, ?, 'album', 'scheduled-album', 'Album', 'draft', 'cover.jpg')").bind(collectionId, creator.user.id).run()
    await env.DB.prepare("INSERT INTO audio_items (id, collection_id, post_id, creator_id, kind, slug, title, status, audio_r2_key, cover_r2_key) VALUES (?, ?, ?, ?, 'music', 'scheduled-audio', 'Audio', 'draft', 'audio.mp3', 'item-cover.jpg')").bind(itemId, collectionId, postId, creator.user.id).run()
    const dueAt = new Date(Date.now() + 2 * 60_000)

    const blocked = await SELF.fetch(`https://example.com/api/schedules/${postId}`, json(creator.cookie, { scheduledFor: dueAt.toISOString() }, 'PUT'))
    expect(blocked.status).toBe(422)
    await expect(blocked.json()).resolves.toMatchObject({ error: { code: 'parent_unpublished' } })

    await env.DB.prepare("UPDATE audio_collections SET status = 'published' WHERE id = ?").bind(collectionId).run()
    expect((await SELF.fetch(`https://example.com/api/schedules/${postId}`, json(creator.cookie, { scheduledFor: dueAt.toISOString() }, 'PUT'))).status).toBe(200)
    await env.DB.prepare("UPDATE audio_collections SET status = 'draft' WHERE id = ?").bind(collectionId).run()
    const result = await processDueSchedules(env, dueAt.getTime() + 1_000)
    expect(result.failed).toBe(1)
    const failed = await env.DB.prepare('SELECT status, last_error_code AS code FROM content_schedules WHERE post_id = ?').bind(postId).first<{ status: string; code: string }>()
    expect(failed).toEqual({ status: 'failed', code: 'parent_unpublished' })
    const alert = await env.DB.prepare("SELECT email_status AS emailStatus FROM notifications WHERE type = 'content_schedule_failed' AND recipient_id = ?").bind(creator.user.id).first<{ emailStatus: string }>()
    expect(alert?.emailStatus).toBe('sent')
  })
})
