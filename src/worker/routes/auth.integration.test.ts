import { beforeAll, describe, expect, it } from 'vitest'
import { env, SELF } from 'cloudflare:test'
import migration0 from '../../../drizzle/0000_overrated_nitro.sql?raw'
import migration1 from '../../../drizzle/0001_add-creator-applications.sql?raw'
import migration2 from '../../../drizzle/0002_better_auth.sql?raw'

async function applyMigration(sql: string) {
  const statements = sql
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean)

  for (const statement of statements) {
    await env.DB.prepare(statement).run()
  }
}

function getCookieHeader(response: Response): string {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] }
  const setCookies = headers.getSetCookie?.() ?? []
  const cookies = setCookies.length > 0
    ? setCookies
    : response.headers.get('set-cookie')?.split(/,(?=\s*[^;,]+=[^;,]+)/) ?? []

  return cookies.map((cookie) => cookie.split(';')[0]).join('; ')
}

describe('Better Auth integration', () => {
  beforeAll(async () => {
    await applyMigration(migration0)
    await applyMigration(migration1)
    await applyMigration(migration2)
  })

  it('keeps the session usable after subscriber upgrades to creator', async () => {
    const email = `creator-${crypto.randomUUID()}@example.com`
    const password = 'password123'

    const registerResponse = await SELF.fetch('https://example.com/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    expect(registerResponse.status).toBe(201)
    const cookie = getCookieHeader(registerResponse)
    expect(cookie).toContain('better-auth')

    const initialMeResponse = await SELF.fetch('https://example.com/api/auth/me', {
      headers: { Cookie: cookie },
    })
    expect(initialMeResponse.status).toBe(200)
    await expect(initialMeResponse.json()).resolves.toMatchObject({
      email,
      role: 'subscriber',
    })

    const formData = new FormData()
    formData.append('fullName', 'Creator Test')
    formData.append('address', '123 Test Street')
    formData.append('city', 'Testville')
    formData.append('country', 'Testland')
    formData.append('nidNumber', 'NID-123')
    formData.append('socialLinks', JSON.stringify(['https://example.com/social']))
    formData.append('contentLinks', JSON.stringify(['https://example.com/content']))
    formData.append(
      'nidDocument',
      new File([new Blob(['image'], { type: 'image/jpeg' })], 'nid.jpg', { type: 'image/jpeg' }),
    )

    const applyResponse = await SELF.fetch('https://example.com/api/creator/apply', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: formData,
    })

    expect(applyResponse.status).toBe(201)
    await expect(applyResponse.json()).resolves.toEqual({ role: 'creator' })

    const refreshedMeResponse = await SELF.fetch('https://example.com/api/auth/me', {
      headers: { Cookie: cookie },
    })
    expect(refreshedMeResponse.status).toBe(200)
    await expect(refreshedMeResponse.json()).resolves.toMatchObject({
      email,
      role: 'creator',
    })

    const postResponse = await SELF.fetch('https://example.com/api/posts', {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ body: 'Posting immediately after upgrade.' }),
    })

    expect(postResponse.status).toBe(201)
    await expect(postResponse.json()).resolves.toMatchObject({
      body: 'Posting immediately after upgrade.',
    })
  })
})
