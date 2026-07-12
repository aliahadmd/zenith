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

async function apply(source: string) {
  for (const statement of source.split('--> statement-breakpoint').map((value) => value.trim()).filter(Boolean)) {
    await env.DB.prepare(statement).run()
  }
}

describe('threaded discussions migration', () => {
  it('preserves existing replies while adding edit and soft-delete metadata', async () => {
    for (const migration of [migration0, migration1, migration2, migration3, migration4, migration5, migration6, migration7, migration8, migration9, migration10, migration11]) {
      await apply(migration)
    }

    await env.DB.prepare("INSERT INTO users (id, email, password_hash, email_verified, role, display_name, username) VALUES ('creator', 'creator@example.com', '', 1, 'creator', 'Creator', 'creator')").run()
    await env.DB.prepare("INSERT INTO users (id, email, password_hash, email_verified, role, display_name, username) VALUES ('member', 'member@example.com', '', 1, 'subscriber', 'Member', 'member')").run()
    await env.DB.prepare("INSERT INTO posts (id, author_id, kind, slug, body) VALUES ('post', 'creator', 'article', 'existing', 'Existing')").run()
    await env.DB.prepare("INSERT INTO post_replies (id, post_id, author_id, body) VALUES ('comment', 'post', 'member', 'Existing comment')").run()

    await apply(migration12)

    const comment = await env.DB.prepare("SELECT body, edited_at AS editedAt, deleted_at AS deletedAt FROM post_replies WHERE id = 'comment'").first<{
      body: string
      editedAt: number | null
      deletedAt: number | null
    }>()
    expect(comment).toEqual({ body: 'Existing comment', editedAt: null, deletedAt: null })
  })
})
