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

async function apply(source: string) {
  for (const statement of source.split('--> statement-breakpoint').map((value) => value.trim()).filter(Boolean)) {
    await env.DB.prepare(statement).run()
  }
}

describe('content scheduling migration', () => {
  it('backfills publication timestamps and cascades schedules with posts', async () => {
    for (const migration of [migration0, migration1, migration2, migration3, migration4, migration5, migration6, migration7, migration8, migration9, migration10, migration11, migration12, migration13]) await apply(migration)
    await env.DB.prepare("INSERT INTO users (id, email, password_hash, email_verified, role, display_name, username) VALUES ('creator', 'creator@example.com', '', 1, 'creator', 'Creator', 'creator')").run()
    await env.DB.prepare("INSERT INTO posts (id, author_id, kind, slug, body, created_at) VALUES ('post', 'creator', 'post', 'post', 'Post', 100)").run()
    await env.DB.prepare("INSERT INTO posts (id, author_id, kind, slug, body, created_at) VALUES ('article-live', 'creator', 'article', 'article-live', 'Live', 200)").run()
    await env.DB.prepare("INSERT INTO articles (post_id, title, markdown, status, published_at) VALUES ('article-live', 'Live', 'Body', 'published', 250)").run()
    await env.DB.prepare("INSERT INTO posts (id, author_id, kind, slug, body, created_at) VALUES ('article-draft', 'creator', 'article', 'article-draft', 'Draft', 300)").run()
    await env.DB.prepare("INSERT INTO articles (post_id, title, markdown, status) VALUES ('article-draft', 'Draft', 'Body', 'draft')").run()

    await apply(migration14)

    const rows = await env.DB.prepare('SELECT id, published_at AS publishedAt FROM posts ORDER BY id').all<{ id: string; publishedAt: number | null }>()
    expect(rows.results).toEqual([
      { id: 'article-draft', publishedAt: null },
      { id: 'article-live', publishedAt: 250 },
      { id: 'post', publishedAt: 100 },
    ])

    await env.DB.prepare("INSERT INTO content_schedules (post_id, creator_id, scheduled_for, next_attempt_at) VALUES ('article-draft', 'creator', 1000, 1000)").run()
    await expect(env.DB.prepare("INSERT INTO content_schedules (post_id, creator_id, scheduled_for, next_attempt_at) VALUES ('article-draft', 'creator', 2000, 2000)").run()).rejects.toThrow()
    await env.DB.prepare("DELETE FROM posts WHERE id = 'article-draft'").run()
    const count = await env.DB.prepare('SELECT count(*) AS count FROM content_schedules').first<{ count: number }>()
    expect(count?.count).toBe(0)
  })
})
