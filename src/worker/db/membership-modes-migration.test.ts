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
import migration16 from '../../../drizzle/0016_stripe_membership_modes.sql?raw'

async function apply(source: string) {
  for (const statement of source.split('--> statement-breakpoint').map((value) => value.trim()).filter(Boolean)) {
    await env.DB.prepare(statement).run()
  }
}

describe('Stripe membership modes migration', () => {
  it('preserves free access and enables historical prices and one-time trial claims', async () => {
    for (const migration of [
      migration0, migration1, migration2, migration3, migration4, migration5, migration6, migration7,
      migration8, migration9, migration10, migration11, migration12, migration13, migration14, migration15,
    ]) await apply(migration)

    await env.DB.prepare("INSERT INTO users (id, email, password_hash, email_verified, role, display_name, username) VALUES ('creator', 'creator@example.com', '', 1, 'creator', 'Creator', 'creator')").run()
    await env.DB.prepare("INSERT INTO users (id, email, password_hash, email_verified, role, display_name, username) VALUES ('member', 'member@example.com', '', 1, 'subscriber', 'Member', 'member')").run()
    await env.DB.prepare("INSERT INTO membership_plans (id, creator_id, name, free_permanent_enabled) VALUES ('plan', 'creator', 'Membership', 1)").run()
    await env.DB.prepare("INSERT INTO subscription_memberships (id, creator_id, subscriber_id, plan_id, provider, access_type, status) VALUES ('membership', 'creator', 'member', 'plan', 'internal', 'free', 'active')").run()

    await apply(migration16)

    expect(await env.DB.prepare("SELECT mode, revision FROM membership_plans WHERE id = 'plan'").first()).toEqual({ mode: 'free_permanent', revision: 0 })
    expect(await env.DB.prepare("SELECT status, access_type AS accessType FROM subscription_memberships WHERE id = 'membership'").first()).toEqual({ status: 'active', accessType: 'free' })

    await env.DB.prepare("INSERT INTO membership_plan_prices (id, plan_id, creator_id, provider, interval, amount_cents, provider_product_id, provider_price_id, active) VALUES ('old', 'plan', 'creator', 'stripe', 'monthly', 500, 'prod', 'price_old', 0)").run()
    await env.DB.prepare("INSERT INTO membership_plan_prices (id, plan_id, creator_id, provider, interval, amount_cents, provider_product_id, provider_price_id, active) VALUES ('new', 'plan', 'creator', 'stripe', 'monthly', 900, 'prod', 'price_new', 1)").run()
    await expect(env.DB.prepare("INSERT INTO membership_plan_prices (id, plan_id, creator_id, provider, interval, amount_cents, provider_product_id, provider_price_id, active) VALUES ('duplicate', 'plan', 'creator', 'stripe', 'monthly', 1200, 'prod', 'price_duplicate', 1)").run()).rejects.toThrow()

    await env.DB.prepare("INSERT INTO membership_trial_claims (creator_id, subscriber_id, plan_id, started_at, ends_at) VALUES ('creator', 'member', 'plan', 1, 2)").run()
    await expect(env.DB.prepare("INSERT INTO membership_trial_claims (creator_id, subscriber_id, plan_id, started_at, ends_at) VALUES ('creator', 'member', 'plan', 3, 4)").run()).rejects.toThrow()

    await env.DB.prepare("DELETE FROM users WHERE id = 'member'").run()
    expect(await env.DB.prepare('SELECT count(*) AS count FROM membership_trial_claims').first()).toEqual({ count: 0 })
  })
})
