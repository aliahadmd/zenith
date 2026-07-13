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
import { subscriptionMemberships, users } from '../db/schema'
import { storeSignInOtp } from '../lib/auth-otp'
import { eq } from 'drizzle-orm'

async function applyMigration(sql: string) {
  for (const statement of sql.split('--> statement-breakpoint').map((value) => value.trim()).filter(Boolean)) {
    await env.DB.prepare(statement).run()
  }
}

function getCookieHeader(response: Response) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] }
  const setCookies = headers.getSetCookie?.() ?? []
  return (setCookies.length > 0 ? setCookies : response.headers.get('set-cookie')?.split(/,(?=\s*[^;,]+=[^;,]+)/) ?? [])
    .map((cookie) => cookie.split(';')[0])
    .join('; ')
}

async function registerUser(prefix: string) {
  const email = `${prefix}-${crypto.randomUUID()}@example.com`
  await storeSignInOtp(createDb(env.DB), email, '123456')
  const response = await SELF.fetch('https://example.com/api/auth/otp/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp: '123456' }),
  })
  expect(response.status).toBe(200)
  const cookie = getCookieHeader(response)
  const me = await SELF.fetch('https://example.com/api/auth/me', { headers: { Cookie: cookie } })
  return { cookie, user: await me.json() as { id: string; username: string } }
}

describe('courses routes', () => {
  beforeAll(async () => {
    for (const migration of [migration0, migration1, migration2, migration3, migration4, migration5, migration6, migration7, migration8, migration9, migration10, migration11, migration12, migration13, migration14, migration15]) {
      await applyMigration(migration)
    }
  })

  it('keeps draft lesson content private and unlocks it for active members', async () => {
    const creator = await registerUser('course-creator')
    const member = await registerUser('course-member')
    const db = createDb(env.DB)
    await db.update(users).set({ role: 'creator' }).where(eq(users.id, creator.user.id)).run()

    const createCourse = await SELF.fetch('https://example.com/api/courses', {
      method: 'POST',
      headers: { Cookie: creator.cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Course Testing', description: 'Learn testing.' }),
    })
    expect(createCourse.status).toBe(201)
    const { course } = await createCourse.json() as { course: { id: string; slug: string } }

    const createModule = await SELF.fetch(`https://example.com/api/courses/${course.id}/modules`, {
      method: 'POST',
      headers: { Cookie: creator.cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Module One' }),
    })
    expect(createModule.status).toBe(201)
    const { module } = await createModule.json() as { module: { id: string } }

    const createLesson = await SELF.fetch(`https://example.com/api/courses/modules/${module.id}/lessons`, {
      method: 'POST',
      headers: { Cookie: creator.cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Lesson One', markdown: 'Private lesson content.' }),
    })
    expect(createLesson.status).toBe(201)
    const { lesson } = await createLesson.json() as { lesson: { id: string } }

    const publishLesson = await SELF.fetch(`https://example.com/api/courses/lessons/${lesson.id}`, {
      method: 'PATCH',
      headers: { Cookie: creator.cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'published' }),
    })
    expect(publishLesson.status).toBe(200)

    const publishCourse = await SELF.fetch(`https://example.com/api/courses/${course.id}/publish`, {
      method: 'POST',
      headers: { Cookie: creator.cookie },
    })
    expect(publishCourse.status).toBe(200)

    const locked = await SELF.fetch(`https://example.com/api/courses/by-slug/${creator.user.username}/${course.slug}`, {
      headers: { Cookie: member.cookie },
    })
    expect(locked.status).toBe(200)
    const lockedJson = await locked.json() as { course: { hasAccess: boolean; modules: Array<{ lessons: Array<{ markdown: string | null; attachments: unknown[] }> }> } }
    expect(lockedJson.course.hasAccess).toBe(false)
    expect(lockedJson.course.modules[0].lessons[0].markdown).toBeNull()
    expect(lockedJson.course.modules[0].lessons[0].attachments).toEqual([])

    await db.insert(subscriptionMemberships).values({
      id: crypto.randomUUID(),
      creatorId: creator.user.id,
      subscriberId: member.user.id,
      provider: 'internal',
      accessType: 'free',
      status: 'active',
    }).run()

    const unlocked = await SELF.fetch(`https://example.com/api/courses/by-slug/${creator.user.username}/${course.slug}`, {
      headers: { Cookie: member.cookie },
    })
    expect(unlocked.status).toBe(200)
    const unlockedJson = await unlocked.json() as { course: { hasAccess: boolean; modules: Array<{ lessons: Array<{ id: string; markdown: string | null }> }> } }
    expect(unlockedJson.course.hasAccess).toBe(true)
    expect(unlockedJson.course.modules[0].lessons[0].markdown).toBe('Private lesson content.')

    const progress = await SELF.fetch(`https://example.com/api/courses/lessons/${lesson.id}/progress`, {
      method: 'PUT',
      headers: { Cookie: member.cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: true }),
    })
    expect(progress.status).toBe(200)
    expect((await progress.json() as { progress: { completedLessons: number } }).progress.completedLessons).toBe(1)
  })
})
