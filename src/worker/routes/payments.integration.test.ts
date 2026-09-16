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
import migration16 from '../../../drizzle/0016_stripe_membership_modes.sql?raw'
import { passwordSignIn, registerVerifiedUser } from '../testing/auth'

async function apply(source: string) {
  for (const statement of source.split('--> statement-breakpoint').map((value) => value.trim()).filter(Boolean)) {
    await env.DB.prepare(statement).run()
  }
}

async function signIn(prefix: string) {
  const email = `${prefix}-${crypto.randomUUID()}@example.com`
  await registerVerifiedUser(email)
  const { cookie, user } = await passwordSignIn(email)
  return { cookie, user }
}

function json(cookieValue: string, body: unknown, method = 'POST') {
  return {
    method,
    headers: { Cookie: cookieValue, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

describe('membership mode routes', () => {
  beforeAll(async () => {
    for (const migration of [
      migration0, migration1, migration2, migration3, migration4, migration5, migration6, migration7,
      migration8, migration9, migration10, migration11, migration12, migration13, migration14, migration15,
      migration16,
    ]) await apply(migration)
  })

  it('enforces one-time trials and grandfathers permanent free access', async () => {
    const creator = await signIn('mode-creator')
    const member = await signIn('mode-member')
    await env.DB.prepare("UPDATE users SET role = 'creator' WHERE id = ?").bind(creator.user.id).run()

    const trialPlan = await SELF.fetch('https://example.com/api/payments/creator/plan', json(creator.cookie, {
      name: 'Test members',
      mode: 'free_trial',
      freeTrialDays: 7,
    }, 'PUT'))
    expect(trialPlan.status).toBe(200)

    const firstTrial = await SELF.fetch('https://example.com/api/payments/subscribe', json(member.cookie, {
      creatorId: creator.user.id,
    }))
    expect(firstTrial.status).toBe(201)
    expect(await firstTrial.json()).toMatchObject({
      kind: 'membership',
      membership: { accessType: 'trial', status: 'trialing', entitled: true },
    })

    expect((await SELF.fetch(`https://example.com/api/payments/memberships/${creator.user.id}`, {
      method: 'DELETE', headers: { Cookie: member.cookie },
    })).status).toBe(204)
    const repeatedTrial = await SELF.fetch('https://example.com/api/payments/subscribe', json(member.cookie, {
      creatorId: creator.user.id,
    }))
    expect(repeatedTrial.status).toBe(409)

    expect((await SELF.fetch('https://example.com/api/payments/creator/plan', json(creator.cookie, {
      name: 'Test members',
      mode: 'free_permanent',
    }, 'PUT'))).status).toBe(200)
    expect((await SELF.fetch('https://example.com/api/payments/subscribe', json(member.cookie, {
      creatorId: creator.user.id,
    }))).status).toBe(201)

    expect((await SELF.fetch('https://example.com/api/payments/creator/plan', json(creator.cookie, {
      name: 'Test members',
      mode: 'disabled',
    }, 'PUT'))).status).toBe(200)

    const options = await SELF.fetch(`https://example.com/api/payments/profile/${creator.user.username}/options`, {
      headers: { Cookie: member.cookie },
    })
    expect(options.status).toBe(200)
    expect(await options.json()).toMatchObject({
      plan: { mode: 'disabled' },
      viewerMembership: { accessType: 'free', status: 'active', entitled: true },
    })
  })
})
