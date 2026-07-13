import { describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
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

async function apply(source: string) {
  for (const statement of source.split('--> statement-breakpoint').map((value) => value.trim()).filter(Boolean)) {
    await env.DB.prepare(statement).run()
  }
}

describe('creator discovery migration', () => {
  it('seeds categories, preserves users, and cascades discovery relationships', async () => {
    for (const migration of [migration0, migration1, migration2, migration3, migration4, migration5, migration6, migration7, migration8, migration9, migration10, migration11, migration12, migration13, migration14]) await apply(migration)
    await env.DB.prepare("INSERT INTO users (id, email, password_hash, email_verified, role, display_name, username) VALUES ('creator', 'creator@example.com', '', 1, 'creator', 'Creator', 'creator')").run()
    await env.DB.prepare("INSERT INTO users (id, email, password_hash, email_verified, role, display_name, username) VALUES ('member', 'member@example.com', '', 1, 'subscriber', 'Member', 'member')").run()

    await apply(migration15)

    const categories = await env.DB.prepare('SELECT id, slug FROM discovery_categories ORDER BY display_order').all<{ id: string; slug: string }>()
    expect(categories.results).toHaveLength(14)
    expect(categories.results[0]).toEqual({ id: 'cat-art-design', slug: 'art-design' })
    expect(await env.DB.prepare('SELECT count(*) AS count FROM users').first<{ count: number }>()).toEqual({ count: 2 })

    await env.DB.prepare("INSERT INTO creator_categories (creator_id, category_id) VALUES ('creator', 'cat-photography')").run()
    await env.DB.prepare("INSERT INTO user_category_interests (user_id, category_id) VALUES ('member', 'cat-photography')").run()
    await env.DB.prepare("INSERT INTO featured_creators (creator_id, display_order, featured_by) VALUES ('creator', 0, 'member')").run()
    await expect(env.DB.prepare("INSERT INTO creator_categories (creator_id, category_id) VALUES ('creator', 'cat-photography')").run()).rejects.toThrow()
    await expect(env.DB.prepare("INSERT INTO discovery_categories (id, slug, name, display_order) VALUES ('duplicate', 'photo-copy', 'PHOTOGRAPHY', 99)").run()).rejects.toThrow()

    await env.DB.prepare("UPDATE discovery_categories SET active = 0 WHERE id = 'cat-photography'").run()
    expect(await env.DB.prepare("SELECT count(*) AS count FROM creator_categories WHERE category_id = 'cat-photography'").first<{ count: number }>()).toEqual({ count: 1 })

    await env.DB.prepare("DELETE FROM users WHERE id = 'creator'").run()
    expect(await env.DB.prepare('SELECT count(*) AS count FROM creator_categories').first<{ count: number }>()).toEqual({ count: 0 })
    expect(await env.DB.prepare('SELECT count(*) AS count FROM featured_creators').first<{ count: number }>()).toEqual({ count: 0 })
    await env.DB.prepare("DELETE FROM users WHERE id = 'member'").run()
    expect(await env.DB.prepare('SELECT count(*) AS count FROM user_category_interests').first<{ count: number }>()).toEqual({ count: 0 })
  })
})
