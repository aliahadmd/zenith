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
import { passwordSignIn, registerVerifiedUser } from '../testing/auth'

async function apply(source: string) {
  for (const statement of source.split('--> statement-breakpoint').map((value) => value.trim()).filter(Boolean)) await env.DB.prepare(statement).run()
}

async function signIn(email: string) {
  await registerVerifiedUser(email)
  const { cookie, user } = await passwordSignIn(email)
  return { cookie, user }
}

describe('saved library routes', () => {
  beforeAll(async () => {
    for (const migration of [migration0, migration1, migration2, migration3, migration4, migration5, migration6, migration7, migration8, migration9, migration10, migration11, migration12, migration13, migration14, migration15]) await apply(migration)
  })

  it('keeps libraries private and returns access-safe mixed content', async () => {
    const creator = await signIn(`creator-${crypto.randomUUID()}@example.com`)
    const member = await signIn(`member-${crypto.randomUUID()}@example.com`)
    const outsider = await signIn(`outsider-${crypto.randomUUID()}@example.com`)
    await env.DB.prepare("UPDATE users SET role = 'creator', display_name = 'Library Creator', username = ? WHERE id = ?").bind(`library-${crypto.randomUUID().slice(0, 8)}`, creator.user.id).run()
    const creatorRow = await env.DB.prepare('SELECT username FROM users WHERE id = ?').bind(creator.user.id).first<{ username: string }>()
    const username = creatorRow!.username

    await env.DB.prepare("INSERT INTO subscription_memberships (id, creator_id, subscriber_id, provider, access_type, status) VALUES (?, ?, ?, 'internal', 'free', 'active')")
      .bind(crypto.randomUUID(), creator.user.id, member.user.id).run()

    const ids = {
      post: crypto.randomUUID(), article: crypto.randomUUID(), audio: crypto.randomUUID(), photography: crypto.randomUUID(), course: crypto.randomUUID(),
    }
    for (const [kind, id] of Object.entries(ids)) {
      await env.DB.prepare('INSERT INTO posts (id, author_id, kind, slug, body, published_at) VALUES (?, ?, ?, ?, ?, unixepoch())')
        .bind(id, creator.user.id, kind, `${kind}-${id.slice(0, 8)}`, `Private ${kind} body`).run()
    }
    await env.DB.prepare("INSERT INTO articles (post_id, title, excerpt, markdown, status, published_at) VALUES (?, 'Private article title', 'Excerpt', '# Secret', 'published', unixepoch())").bind(ids.article).run()
    const collectionId = crypto.randomUUID()
    await env.DB.prepare("INSERT INTO audio_collections (id, creator_id, kind, slug, title, status) VALUES (?, ?, 'album', 'saved-album', 'Saved Album', 'published')").bind(collectionId, creator.user.id).run()
    await env.DB.prepare("INSERT INTO audio_items (id, collection_id, post_id, creator_id, kind, slug, title, status, audio_r2_key, published_at) VALUES (?, ?, ?, ?, 'music', 'saved-track', 'Private audio title', 'published', 'audio/private.mp3', unixepoch())").bind(crypto.randomUUID(), collectionId, ids.audio, creator.user.id).run()
    await env.DB.prepare("INSERT INTO photography_albums (id, post_id, creator_id, slug, title, status, published_at) VALUES (?, ?, ?, 'saved-photos', 'Private photography title', 'published', unixepoch())").bind(crypto.randomUUID(), ids.photography, creator.user.id).run()
    await env.DB.prepare("INSERT INTO courses (id, post_id, creator_id, slug, title, status, published_at) VALUES (?, ?, ?, 'saved-course', 'Private course title', 'published', unixepoch())").bind(crypto.randomUUID(), ids.course, creator.user.id).run()

    const denied = await SELF.fetch(`https://example.com/api/library/${ids.post}`, { method: 'POST', headers: { Cookie: outsider.cookie } })
    expect(denied.status).toBe(403)
    for (const id of Object.values(ids)) {
      const response = await SELF.fetch(`https://example.com/api/library/${id}`, { method: 'POST', headers: { Cookie: member.cookie } })
      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({ saved: true })
    }
    const duplicate = await SELF.fetch(`https://example.com/api/library/${ids.post}`, { method: 'POST', headers: { Cookie: member.cookie } })
    expect(duplicate.status).toBe(200)
    await env.DB.prepare('UPDATE saved_items SET saved_at = CASE post_id WHEN ? THEN 10 WHEN ? THEN 20 ELSE 15 END WHERE user_id = ?')
      .bind(ids.post, ids.article, member.user.id).run()

    const mixed = await SELF.fetch('https://example.com/api/library?pageSize=20', { headers: { Cookie: member.cookie } })
    expect(mixed.status).toBe(200)
    const mixedJson = await mixed.json() as { total: number; items: Array<{ availability: string; type: string; item?: { viewerSaved: boolean; streamUrl?: string } }> }
    expect(mixedJson.total).toBe(5)
    expect(new Set(mixedJson.items.map((item) => item.type))).toEqual(new Set(['post', 'article', 'audio', 'photography', 'course']))
    expect(mixedJson.items.every((item) => item.availability === 'available' && item.item?.viewerSaved)).toBe(true)
    expect(mixedJson.items.find((item) => item.type === 'audio')?.item?.streamUrl).toContain('/api/audio/items/')

    const articleSearch = await SELF.fetch('https://example.com/api/library?type=article&query=Private%20article', { headers: { Cookie: member.cookie } })
    expect(articleSearch.status).toBe(200)
    await expect(articleSearch.json()).resolves.toMatchObject({ total: 1, items: [{ type: 'article', availability: 'available' }] })
    const oldest = await SELF.fetch('https://example.com/api/library?sort=oldest&pageSize=20', { headers: { Cookie: member.cookie } })
    const oldestJson = await oldest.json() as { items: Array<{ postId: string }> }
    expect(oldestJson.items[0].postId).toBe(ids.post)

    await env.DB.prepare("UPDATE subscription_memberships SET status = 'expired' WHERE subscriber_id = ? AND creator_id = ?").bind(member.user.id, creator.user.id).run()
    const locked = await SELF.fetch('https://example.com/api/library?pageSize=20', { headers: { Cookie: member.cookie } })
    const lockedJson = await locked.json() as { items: unknown[] }
    expect(lockedJson.items).toHaveLength(5)
    expect(JSON.stringify(lockedJson)).not.toContain('Private article title')
    expect(JSON.stringify(lockedJson)).not.toContain('/api/audio')
    expect(lockedJson.items).toEqual(expect.arrayContaining([expect.objectContaining({ availability: 'membership_required', creator: expect.objectContaining({ username }) })]))

    const secretSearch = await SELF.fetch('https://example.com/api/library?query=Private%20article', { headers: { Cookie: member.cookie } })
    await expect(secretSearch.json()).resolves.toMatchObject({ total: 0, items: [] })
    const creatorSearch = await SELF.fetch(`https://example.com/api/library?query=${username}`, { headers: { Cookie: member.cookie } })
    await expect(creatorSearch.json()).resolves.toMatchObject({ total: 5 })

    await env.DB.prepare("UPDATE subscription_memberships SET status = 'trialing', trial_ends_at = unixepoch() + 3600 WHERE subscriber_id = ? AND creator_id = ?").bind(member.user.id, creator.user.id).run()
    const restored = await SELF.fetch('https://example.com/api/library?type=article', { headers: { Cookie: member.cookie } })
    await expect(restored.json()).resolves.toMatchObject({ total: 1, items: [{ availability: 'available' }] })

    await env.DB.prepare("UPDATE posts SET moderation_status = 'hidden' WHERE id = ?").bind(ids.article).run()
    const unavailable = await SELF.fetch('https://example.com/api/library?type=article', { headers: { Cookie: member.cookie } })
    const unavailableJson = await unavailable.json() as { items: Array<Record<string, unknown>> }
    expect(unavailableJson.items[0]).toEqual(expect.objectContaining({ availability: 'unavailable', postId: ids.article }))
    expect(unavailableJson.items[0]).not.toHaveProperty('creator')
    expect(unavailableJson.items[0]).not.toHaveProperty('item')

    const outsiderLibrary = await SELF.fetch('https://example.com/api/library', { headers: { Cookie: outsider.cookie } })
    await expect(outsiderLibrary.json()).resolves.toMatchObject({ total: 0, items: [] })
    expect((await SELF.fetch('https://example.com/api/library?pageSize=51', { headers: { Cookie: member.cookie } })).status).toBe(422)

    expect((await SELF.fetch(`https://example.com/api/library/${ids.post}`, { method: 'DELETE', headers: { Cookie: member.cookie } })).status).toBe(200)
    await expect(SELF.fetch(`https://example.com/api/library/${ids.post}`, { method: 'DELETE', headers: { Cookie: member.cookie } }).then((response) => response.json())).resolves.toEqual({ saved: false })
  })
})
