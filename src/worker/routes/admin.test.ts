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

async function applyMigration(source: string) {
  for (const statement of source.split('--> statement-breakpoint').map((value) => value.trim()).filter(Boolean)) {
    await env.DB.prepare(statement).run()
  }
}

function cookieHeader(response: Response) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] }
  const values = headers.getSetCookie?.() ?? []
  return (values.length ? values : response.headers.get('set-cookie')?.split(/,(?=\s*[^;,]+=[^;,]+)/) ?? [])
    .map((cookie) => cookie.split(';')[0])
    .join('; ')
}

async function register(prefix: string) {
  const email = `${prefix}-${crypto.randomUUID()}@example.com`
  await storeSignInOtp(createDb(env.DB), email, '123456')
  const response = await SELF.fetch('https://example.com/api/auth/otp/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp: '123456' }),
  })
  expect(response.status).toBe(200)
  const user = await response.clone().json() as { id: string; username: string; role: string }
  return { email, user, cookie: cookieHeader(response) }
}

async function grantAdmin(userId: string, role: 'owner' | 'moderator', grantedBy: string | null = null) {
  await env.DB.prepare('INSERT INTO admin_memberships (user_id, role, granted_by) VALUES (?, ?, ?)').bind(userId, role, grantedBy).run()
}

function jsonRequest(cookie: string, body?: unknown, method = 'POST') {
  return { method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }
}

describe('admin dashboard routes', () => {
  beforeAll(async () => {
    for (const migration of [migration0, migration1, migration2, migration3, migration4, migration5, migration6, migration7, migration8, migration9, migration10, migration11, migration12, migration13, migration14, migration15]) {
      await applyMigration(migration)
    }
  })

  it('enforces admin roles and protects the final owner', async () => {
    const owner = await register('owner')
    const moderator = await register('moderator')
    const member = await register('member')
    await grantAdmin(owner.user.id, 'owner')
    await grantAdmin(moderator.user.id, 'moderator', owner.user.id)

    const denied = await SELF.fetch('https://example.com/api/admin/overview', { headers: { Cookie: member.cookie } })
    expect(denied.status).toBe(403)

    const moderatorAdmins = await SELF.fetch('https://example.com/api/admin/administrators', { headers: { Cookie: moderator.cookie } })
    expect(moderatorAdmins.status).toBe(403)

    const moderatorSuspendsOwner = await SELF.fetch(
      `https://example.com/api/admin/users/${owner.user.id}/suspend`,
      jsonRequest(moderator.cookie, { reason: 'A sufficiently clear moderation reason' }),
    )
    expect(moderatorSuspendsOwner.status).toBe(403)

    const removeFinalOwner = await SELF.fetch(
      `https://example.com/api/admin/administrators/${owner.user.id}`,
      jsonRequest(owner.cookie, { reason: 'Testing final owner protection' }, 'DELETE'),
    )
    expect(removeFinalOwner.status).toBe(409)
  })

  it('keeps creator applications pending until an administrator approves them', async () => {
    const owner = await register('review-owner')
    const applicant = await register('applicant')
    await grantAdmin(owner.user.id, 'owner')

    const form = new FormData()
    form.append('fullName', 'Pending Creator')
    form.append('address', '10 Review Street')
    form.append('city', 'Review City')
    form.append('country', 'Reviewland')
    form.append('nidNumber', 'REVIEW-123')
    form.append('socialLinks', JSON.stringify(['https://example.com/social']))
    form.append('contentLinks', JSON.stringify(['https://example.com/content']))
    form.append('nidDocument', new File(['image'], 'nid.jpg', { type: 'image/jpeg' }))
    const apply = await SELF.fetch('https://example.com/api/creator/apply', { method: 'POST', headers: { Cookie: applicant.cookie }, body: form })
    expect(apply.status).toBe(201)
    await expect(apply.json()).resolves.toEqual({ application: { status: 'pending' } })

    const mine = await SELF.fetch('https://example.com/api/creator/application/me', { headers: { Cookie: applicant.cookie } })
    await expect(mine.json()).resolves.toMatchObject({ application: { status: 'pending', fullName: 'Pending Creator' } })

    const row = await env.DB.prepare('SELECT id FROM creator_applications WHERE user_id = ?').bind(applicant.user.id).first<{ id: string }>()
    const approve = await SELF.fetch(
      `https://example.com/api/admin/applications/${row!.id}/approve`,
      jsonRequest(owner.cookie, { reason: 'Identity and content samples verified' }),
    )
    expect(approve.status).toBe(200)

    const me = await SELF.fetch('https://example.com/api/auth/me', { headers: { Cookie: applicant.cookie } })
    await expect(me.json()).resolves.toMatchObject({ role: 'creator' })
    const audit = await env.DB.prepare("SELECT action FROM admin_audit_logs WHERE target_id = ? AND action = 'creator_application_approved'").bind(row!.id).first()
    expect(audit).toBeTruthy()
  })

  it('aggregates reports, prevents duplicates, and hides reported content', async () => {
    const owner = await register('moderation-owner')
    const creator = await register('reported-creator')
    const reporterA = await register('reporter-a')
    const reporterB = await register('reporter-b')
    await grantAdmin(owner.user.id, 'owner')
    await env.DB.prepare("UPDATE users SET role = 'creator' WHERE id = ?").bind(creator.user.id).run()

    const postResponse = await SELF.fetch('https://example.com/api/posts', jsonRequest(creator.cookie, { body: 'Reported post' }))
    expect(postResponse.status).toBe(201)
    const post = await postResponse.json() as { id: string; slug: string }

    const reportBody = { targetType: 'post', targetId: post.id, reason: 'spam', details: 'Repeated promotional links' }
    const first = await SELF.fetch('https://example.com/api/reports', jsonRequest(reporterA.cookie, reportBody))
    expect(first.status).toBe(201)
    const caseId = (await first.json() as { caseId: string }).caseId
    const duplicate = await SELF.fetch('https://example.com/api/reports', jsonRequest(reporterA.cookie, reportBody))
    expect(duplicate.status).toBe(409)
    const second = await SELF.fetch('https://example.com/api/reports', jsonRequest(reporterB.cookie, { ...reportBody, reason: 'harassment' }))
    expect(second.status).toBe(201)
    await expect(second.json()).resolves.toMatchObject({ caseId })

    const hide = await SELF.fetch(
      `https://example.com/api/admin/reports/${caseId}/action`,
      jsonRequest(owner.cookie, { action: 'hide', reason: 'Confirmed policy violation' }),
    )
    expect(hide.status).toBe(200)

    const hiddenDetail = await SELF.fetch(`https://example.com/api/posts/by-slug/${creator.user.username}/${post.slug}`, { headers: { Cookie: creator.cookie } })
    expect(hiddenDetail.status).toBe(404)
    const reportCount = await env.DB.prepare('SELECT count(*) AS count FROM content_reports WHERE case_id = ?').bind(caseId).first<{ count: number }>()
    expect(Number(reportCount?.count)).toBe(2)
  })

  it('allows rejected applications to replace their private document and resubmit', async () => {
    const owner = await register('rejection-owner')
    const applicant = await register('rejected-applicant')
    await grantAdmin(owner.user.id, 'owner')

    const applicationForm = (fileName: string, content: string) => {
      const form = new FormData()
      form.append('fullName', 'Resubmitting Creator')
      form.append('address', '20 Review Street')
      form.append('city', 'Review City')
      form.append('country', 'Reviewland')
      form.append('nidNumber', 'REVIEW-456')
      form.append('socialLinks', JSON.stringify(['https://example.com/social']))
      form.append('contentLinks', JSON.stringify(['https://example.com/content']))
      form.append('nidDocument', new File([content], fileName, { type: 'image/jpeg' }))
      return form
    }

    const initial = await SELF.fetch('https://example.com/api/creator/apply', { method: 'POST', headers: { Cookie: applicant.cookie }, body: applicationForm('old.jpg', 'old') })
    expect(initial.status).toBe(201)
    const before = await env.DB.prepare('SELECT id, nid_document_r2_key AS key FROM creator_applications WHERE user_id = ?').bind(applicant.user.id).first<{ id: string; key: string }>()
    expect(await env.STORAGE.get(before!.key)).toBeTruthy()

    const documentView = await SELF.fetch(`https://example.com/api/admin/applications/${before!.id}/document`, { headers: { Cookie: owner.cookie } })
    expect(documentView.status).toBe(200)
    const viewAudit = await env.DB.prepare("SELECT id FROM admin_audit_logs WHERE action = 'creator_document_viewed' AND target_id = ?").bind(before!.id).first()
    expect(viewAudit).toBeTruthy()

    const reject = await SELF.fetch(`https://example.com/api/admin/applications/${before!.id}/reject`, jsonRequest(owner.cookie, { reason: 'Please provide a clearer identity document' }))
    expect(reject.status).toBe(200)
    const resubmit = await SELF.fetch('https://example.com/api/creator/apply', { method: 'POST', headers: { Cookie: applicant.cookie }, body: applicationForm('new.jpg', 'new') })
    expect(resubmit.status).toBe(200)

    const after = await env.DB.prepare('SELECT status, nid_document_r2_key AS key FROM creator_applications WHERE id = ?').bind(before!.id).first<{ status: string; key: string }>()
    expect(after?.status).toBe('pending')
    expect(after?.key).not.toBe(before?.key)
    expect(await env.STORAGE.get(before!.key)).toBeNull()
    expect(await env.STORAGE.get(after!.key)).toBeTruthy()
  })

  it('revokes suspended sessions and blocks OTP sign-in until restoration', async () => {
    const owner = await register('suspension-owner')
    const member = await register('suspended-member')
    await grantAdmin(owner.user.id, 'owner')

    const suspend = await SELF.fetch(
      `https://example.com/api/admin/users/${member.user.id}/suspend`,
      jsonRequest(owner.cookie, { reason: 'Confirmed repeated harassment' }),
    )
    expect(suspend.status).toBe(200)

    const oldSession = await SELF.fetch('https://example.com/api/auth/me', { headers: { Cookie: member.cookie } })
    expect(oldSession.status).toBe(401)

    const otpRequest = await SELF.fetch('https://example.com/api/auth/otp/request', jsonRequest('', { email: member.email }))
    expect(otpRequest.status).toBe(403)
    await expect(otpRequest.json()).resolves.toMatchObject({ error: { code: 'account_suspended' } })

    const restore = await SELF.fetch(
      `https://example.com/api/admin/users/${member.user.id}/restore`,
      jsonRequest(owner.cookie, { reason: 'Manual review completed' }),
    )
    expect(restore.status).toBe(200)
    const restoredOtp = await SELF.fetch('https://example.com/api/auth/otp/request', jsonRequest('', { email: member.email }))
    expect(restoredOtp.status).not.toBe(403)
  })
})
