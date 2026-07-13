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
import { storeSignInOtp } from '../lib/auth-otp'

async function apply(source: string) {
  for (const statement of source.split('--> statement-breakpoint').map((value) => value.trim()).filter(Boolean)) await env.DB.prepare(statement).run()
}

function cookie(response: Response) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] }
  return (headers.getSetCookie?.() ?? [response.headers.get('set-cookie') ?? '']).map((value) => value.split(';')[0]).filter(Boolean).join('; ')
}

async function signIn(prefix: string) {
  const email = `${prefix}-${crypto.randomUUID()}@example.com`
  await storeSignInOtp(createDb(env.DB), email, '123456')
  const response = await SELF.fetch('https://example.com/api/auth/otp/verify', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, otp: '123456' }),
  })
  return { cookie: cookie(response), user: await response.json() as { id: string; username: string } }
}

function json(cookieHeader: string, body: unknown, method = 'PUT') {
  return { method, headers: { Cookie: cookieHeader, 'content-type': 'application/json' }, body: JSON.stringify(body) }
}

async function makeCreator(userId: string, input: { name: string; username: string; categoryId?: string; published?: boolean }) {
  await env.DB.prepare('UPDATE users SET role = \'creator\', display_name = ?, username = ?, tagline = ? WHERE id = ?')
    .bind(input.name, input.username, `${input.name} private lessons`, userId).run()
  if (input.categoryId) await env.DB.prepare('INSERT INTO creator_categories (creator_id, category_id) VALUES (?, ?)').bind(userId, input.categoryId).run()
  if (input.published !== false) {
    await env.DB.prepare("INSERT INTO posts (id, author_id, kind, slug, body, published_at) VALUES (?, ?, 'post', ?, 'protected body', unixepoch())")
      .bind(crypto.randomUUID(), userId, `${input.username}-post`).run()
  }
}

describe('creator discovery routes', () => {
  beforeAll(async () => {
    for (const migration of [migration0, migration1, migration2, migration3, migration4, migration5, migration6, migration7, migration8, migration9, migration10, migration11, migration12, migration13, migration14, migration15]) await apply(migration)
  })

  it('searches only eligible creators and never returns protected content', async () => {
    const viewer = await signIn('discovery-viewer')
    const photographer = await signIn('discovery-photo')
    const draftCreator = await signIn('discovery-draft')
    const hiddenCreator = await signIn('discovery-hidden')
    await makeCreator(photographer.user.id, { name: 'Photo Person', username: 'photo-person', categoryId: 'cat-photography' })
    await makeCreator(draftCreator.user.id, { name: 'Draft Person', username: 'draft-person', published: false })
    await makeCreator(hiddenCreator.user.id, { name: 'Hidden Person', username: 'hidden-person' })
    await env.DB.prepare("UPDATE posts SET moderation_status = 'hidden' WHERE author_id = ?").bind(hiddenCreator.user.id).run()

    expect((await SELF.fetch('https://example.com/api/discovery/creators')).status).toBe(401)
    const response = await SELF.fetch('https://example.com/api/discovery/creators?q=Photo&category=photography', { headers: { Cookie: viewer.cookie } })
    expect(response.status).toBe(200)
    const body = await response.json() as { creators: Array<Record<string, unknown>>; total: number }
    expect(body.total).toBe(1)
    expect(body.creators[0]).toMatchObject({ username: 'photo-person', publishedContentCount: 1, contentTypes: ['post'] })
    expect(body.creators[0]).not.toHaveProperty('body')
    expect(body.creators[0]).not.toHaveProperty('activeSubscriberCount')
    expect(JSON.stringify(body)).not.toContain('protected body')

    const wildcard = await SELF.fetch('https://example.com/api/discovery/creators?q=%25', { headers: { Cookie: viewer.cookie } })
    await expect(wildcard.json()).resolves.toMatchObject({ total: 0, creators: [] })
    const profile = await SELF.fetch('https://example.com/api/profile/photo-person', { headers: { Cookie: viewer.cookie } })
    await expect(profile.json()).resolves.toMatchObject({ categories: [{ id: 'cat-photography', slug: 'photography', name: 'Photography' }] })
  })

  it('uses interests for ranking, preserves inactive selections, and excludes subscriptions', async () => {
    const viewer = await signIn('recommend-viewer')
    const photographer = await signIn('recommend-photo')
    const business = await signIn('recommend-business')
    await makeCreator(photographer.user.id, { name: 'Recommended Photo', username: 'recommended-photo', categoryId: 'cat-photography' })
    await makeCreator(business.user.id, { name: 'Popular Business', username: 'popular-business', categoryId: 'cat-business' })
    const otherMember = await signIn('recommend-member')
    await env.DB.prepare("INSERT INTO subscription_memberships (id, creator_id, subscriber_id, provider, access_type, status) VALUES (?, ?, ?, 'internal', 'free', 'active')")
      .bind(crypto.randomUUID(), business.user.id, otherMember.user.id).run()

    const interests = await SELF.fetch('https://example.com/api/discovery/interests', json(viewer.cookie, { categoryIds: ['cat-photography'] }))
    expect(interests.status).toBe(200)
    const overview = await SELF.fetch('https://example.com/api/discovery', { headers: { Cookie: viewer.cookie } })
    const overviewBody = await overview.json() as { recommended: Array<{ id: string; recommendationReason: string }>; needsInterests: boolean }
    expect(overviewBody.needsInterests).toBe(false)
    const photographerIndex = overviewBody.recommended.findIndex((creator) => creator.id === photographer.user.id)
    const businessIndex = overviewBody.recommended.findIndex((creator) => creator.id === business.user.id)
    expect(photographerIndex).toBeGreaterThanOrEqual(0)
    expect(businessIndex).toBeGreaterThan(photographerIndex)
    expect(overviewBody.recommended[photographerIndex]).toMatchObject({ recommendationReason: 'Matches your Photography interest' })

    await env.DB.prepare("UPDATE discovery_categories SET active = 0 WHERE id = 'cat-photography'").run()
    await SELF.fetch('https://example.com/api/discovery/interests', json(viewer.cookie, { categoryIds: ['cat-business'] }))
    expect(await env.DB.prepare("SELECT count(*) AS count FROM user_category_interests WHERE user_id = ? AND category_id = 'cat-photography'").bind(viewer.user.id).first<{ count: number }>()).toEqual({ count: 1 })
    await env.DB.prepare("UPDATE discovery_categories SET active = 1 WHERE id = 'cat-photography'").run()

    await env.DB.prepare("INSERT INTO subscription_memberships (id, creator_id, subscriber_id, provider, access_type, status) VALUES (?, ?, ?, 'internal', 'free', 'active')")
      .bind(crypto.randomUUID(), photographer.user.id, viewer.user.id).run()
    const recommended = await SELF.fetch('https://example.com/api/discovery/creators?sort=recommended&pageSize=50', { headers: { Cookie: viewer.cookie } })
    const recommendedBody = await recommended.json() as { creators: Array<{ id: string }> }
    expect(recommendedBody.creators.some((creator) => creator.id === photographer.user.id)).toBe(false)

    const tooMany = await SELF.fetch('https://example.com/api/discovery/interests', json(viewer.cookie, {
      categoryIds: ['cat-art-design', 'cat-business', 'cat-education', 'cat-entertainment', 'cat-gaming', 'cat-travel'],
    }))
    expect(tooMany.status).toBe(422)
  })

  it('restricts taxonomy and featured curation to owners and audits changes', async () => {
    const owner = await signIn('discovery-owner')
    const moderator = await signIn('discovery-moderator')
    const creator = await signIn('discovery-featured')
    await makeCreator(creator.user.id, { name: 'Featured Creator', username: 'featured-creator' })
    await env.DB.prepare("INSERT INTO admin_memberships (user_id, role) VALUES (?, 'owner')").bind(owner.user.id).run()
    await env.DB.prepare("INSERT INTO admin_memberships (user_id, role, granted_by) VALUES (?, 'moderator', ?)").bind(moderator.user.id, owner.user.id).run()

    expect((await SELF.fetch('https://example.com/api/admin/discovery/categories', { headers: { Cookie: moderator.cookie } })).status).toBe(403)
    const created = await SELF.fetch('https://example.com/api/admin/discovery/categories', json(owner.cookie, {
      name: 'Architecture', description: 'Buildings and environments', reason: 'Expand the launch taxonomy',
    }, 'POST'))
    expect(created.status).toBe(201)
    const createdCategory = await created.json() as { id: string; slug: string }
    expect(createdCategory.slug).toBe('architecture')

    const featured = await SELF.fetch('https://example.com/api/admin/discovery/featured', json(owner.cookie, {
      creatorIds: [creator.user.id], reason: 'Feature a launch creator',
    }))
    expect(featured.status).toBe(200)
    const publicOverview = await SELF.fetch('https://example.com/api/discovery', { headers: { Cookie: moderator.cookie } })
    await expect(publicOverview.json()).resolves.toMatchObject({ featured: [{ id: creator.user.id, featured: true }] })
    const audit = await env.DB.prepare("SELECT count(*) AS count FROM admin_audit_logs WHERE actor_id = ? AND action IN ('discovery_category_created', 'featured_creators_replaced')")
      .bind(owner.user.id).first<{ count: number }>()
    expect(audit?.count).toBe(2)
  })
})
