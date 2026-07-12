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

async function apply(source: string) {
  for (const statement of source.split('--> statement-breakpoint').map((value) => value.trim()).filter(Boolean)) {
    await env.DB.prepare(statement).run()
  }
}

describe('admin dashboard migration', () => {
  it('preserves existing active users, approved applications, and published content', async () => {
    for (const migration of [migration0, migration1, migration2, migration3, migration4, migration5, migration6, migration7, migration8, migration9, migration10]) await apply(migration)

    await env.DB.prepare("INSERT INTO users (id, email, password_hash, email_verified, role, display_name, username) VALUES ('creator-1', 'existing@example.com', '', 1, 'creator', 'Existing Creator', 'existing')").run()
    await env.DB.prepare("INSERT INTO creator_applications (id, user_id, full_name, address, city, country, nid_number, nid_document_r2_key, social_links, content_links, status) VALUES ('application-1', 'creator-1', 'Existing Creator', 'Address', 'City', 'Country', 'NID', 'nid/key', '[]', '[]', 'approved')").run()
    await env.DB.prepare("INSERT INTO posts (id, author_id, kind, slug, body) VALUES ('post-1', 'creator-1', 'post', 'existing-post', 'Existing content')").run()

    await apply(migration11)

    const user = await env.DB.prepare("SELECT account_status AS accountStatus, role FROM users WHERE id = 'creator-1'").first<{ accountStatus: string; role: string }>()
    const application = await env.DB.prepare("SELECT status FROM creator_applications WHERE id = 'application-1'").first<{ status: string }>()
    const post = await env.DB.prepare("SELECT moderation_status AS moderationStatus FROM posts WHERE id = 'post-1'").first<{ moderationStatus: string }>()
    expect(user).toEqual({ accountStatus: 'active', role: 'creator' })
    expect(application?.status).toBe('approved')
    expect(post?.moderationStatus).toBe('active')
  })
})
