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

async function apply(source: string) {
  for (const statement of source.split('--> statement-breakpoint').map((value) => value.trim()).filter(Boolean)) {
    await env.DB.prepare(statement).run()
  }
}

describe('saved library migration', () => {
  it('preserves content, keeps one timestamp per user/post, and cascades deleted content', async () => {
    for (const migration of [migration0, migration1, migration2, migration3, migration4, migration5, migration6, migration7, migration8, migration9, migration10, migration11, migration12]) await apply(migration)
    await env.DB.prepare("INSERT INTO users (id, email, password_hash, email_verified, role, display_name, username) VALUES ('creator', 'creator@example.com', '', 1, 'creator', 'Creator', 'creator')").run()
    await env.DB.prepare("INSERT INTO users (id, email, password_hash, email_verified, role, display_name, username) VALUES ('member', 'member@example.com', '', 1, 'subscriber', 'Member', 'member')").run()
    await env.DB.prepare("INSERT INTO posts (id, author_id, kind, slug, body) VALUES ('post', 'creator', 'post', 'saved-post', 'Saved post')").run()

    await apply(migration13)
    await env.DB.prepare("INSERT INTO saved_items (user_id, post_id, saved_at) VALUES ('member', 'post', 100)").run()
    await env.DB.prepare("INSERT INTO saved_items (user_id, post_id, saved_at) VALUES ('member', 'post', 200) ON CONFLICT(user_id, post_id) DO NOTHING").run()
    const saved = await env.DB.prepare("SELECT saved_at AS savedAt FROM saved_items WHERE user_id = 'member' AND post_id = 'post'").first<{ savedAt: number }>()
    expect(saved?.savedAt).toBe(100)

    await env.DB.prepare("DELETE FROM posts WHERE id = 'post'").run()
    const afterPostDelete = await env.DB.prepare("SELECT count(*) AS count FROM saved_items WHERE user_id = 'member'").first<{ count: number }>()
    expect(afterPostDelete?.count).toBe(0)
  })
})
