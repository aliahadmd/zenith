import { beforeAll, describe, expect, it } from 'vitest'
import { env, SELF } from 'cloudflare:test'
import migration0 from '../../../drizzle/0000_overrated_nitro.sql?raw'
import migration1 from '../../../drizzle/0001_add-creator-applications.sql?raw'
import migration2 from '../../../drizzle/0002_better_auth.sql?raw'
import migration3 from '../../../drizzle/0003_creator_subscriptions.sql?raw'
import migration4 from '../../../drizzle/0004_feed_interactions.sql?raw'
import migration5 from '../../../drizzle/0005_articles.sql?raw'

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
    await applyMigration(migration3)
    await applyMigration(migration4)
    await applyMigration(migration5)
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
    const initialUser = await initialMeResponse.json() as { email: string; role: string; username: string }
    expect(initialUser).toMatchObject({
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
    const postJson = await postResponse.json() as { id: string; slug: string; body: string }
    expect(postJson).toMatchObject({
      body: 'Posting immediately after upgrade.',
    })
    expect(postJson.slug).toBe('posting-immediately-after-upgrade')

    const postDetailResponse = await SELF.fetch(`https://example.com/api/posts/by-slug/${initialUser.username}/${postJson.slug}`, {
      headers: { Cookie: cookie },
    })
    expect(postDetailResponse.status).toBe(200)
    await expect(postDetailResponse.json()).resolves.toMatchObject({
      post: {
        id: postJson.id,
        slug: postJson.slug,
        likeCount: 0,
        replyCount: 0,
      },
      replies: [],
    })

    const likeResponse = await SELF.fetch(`https://example.com/api/posts/${postJson.id}/like`, {
      method: 'POST',
      headers: { Cookie: cookie },
    })
    expect(likeResponse.status).toBe(200)
    await expect(likeResponse.json()).resolves.toEqual({ likeCount: 1, viewerLiked: true })

    const replyResponse = await SELF.fetch(`https://example.com/api/posts/${postJson.id}/replies`, {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ body: 'Thanks for reading.' }),
    })
    expect(replyResponse.status).toBe(201)
    const replyJson = await replyResponse.json() as { reply: { id: string; mentionedUser: { username: string } } }
    expect(replyJson.reply.mentionedUser.username).toBe(initialUser.username)

    const replyLikeResponse = await SELF.fetch(`https://example.com/api/replies/${replyJson.reply.id}/like`, {
      method: 'POST',
      headers: { Cookie: cookie },
    })
    expect(replyLikeResponse.status).toBe(200)
    await expect(replyLikeResponse.json()).resolves.toEqual({ likeCount: 1, viewerLiked: true })

    const tooManyImages = new FormData()
    tooManyImages.append('body', 'Too many images')
    for (let index = 0; index < 5; index += 1) {
      tooManyImages.append('images', new File(['image'], `image-${index}.jpg`, { type: 'image/jpeg' }))
    }

    const tooManyImagesResponse = await SELF.fetch('https://example.com/api/posts', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: tooManyImages,
    })
    expect(tooManyImagesResponse.status).toBe(422)

    const mediaPost = new FormData()
    mediaPost.append('body', 'Photo update')
    mediaPost.append('images', new File(['private image'], 'photo.png', { type: 'image/png' }))

    const mediaPostResponse = await SELF.fetch('https://example.com/api/posts', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: mediaPost,
    })
    expect(mediaPostResponse.status).toBe(201)
    const mediaPostJson = await mediaPostResponse.json() as { id: string; slug: string }

    const mediaPostDetailResponse = await SELF.fetch(`https://example.com/api/posts/by-slug/${initialUser.username}/${mediaPostJson.slug}`, {
      headers: { Cookie: cookie },
    })
    expect(mediaPostDetailResponse.status).toBe(200)
    const mediaPostDetail = await mediaPostDetailResponse.json() as { post: { attachments: Array<{ id: string; contentType: string }> } }
    expect(mediaPostDetail.post.attachments).toHaveLength(1)
    expect(mediaPostDetail.post.attachments[0].contentType).toBe('image/png')

    const mediaResponse = await SELF.fetch(`https://example.com/api/media/${mediaPostDetail.post.attachments[0].id}`, {
      headers: { Cookie: cookie },
    })
    expect(mediaResponse.status).toBe(200)
    expect(mediaResponse.headers.get('content-type')).toBe('image/png')
    await expect(mediaResponse.arrayBuffer()).resolves.toHaveProperty('byteLength', 'private image'.length)

    const pollPost = new FormData()
    pollPost.append('pollQuestion', 'Choose one')
    pollPost.append('pollOptions', JSON.stringify(['Alpha', 'Beta']))

    const pollPostResponse = await SELF.fetch('https://example.com/api/posts', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: pollPost,
    })
    expect(pollPostResponse.status).toBe(201)
    const pollPostJson = await pollPostResponse.json() as { slug: string }

    const pollDetailResponse = await SELF.fetch(`https://example.com/api/posts/by-slug/${initialUser.username}/${pollPostJson.slug}`, {
      headers: { Cookie: cookie },
    })
    expect(pollDetailResponse.status).toBe(200)
    const pollDetail = await pollDetailResponse.json() as {
      post: {
        poll: {
          id: string
          viewerOptionId: string | null
          totalVotes: number
          options: Array<{ id: string; text: string; voteCount: number }>
        }
      }
    }
    const alphaOption = pollDetail.post.poll.options.find((option) => option.text === 'Alpha')
    expect(alphaOption).toBeDefined()

    const voteResponse = await SELF.fetch(`https://example.com/api/polls/${pollDetail.post.poll.id}/vote`, {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ optionId: alphaOption?.id }),
    })
    expect(voteResponse.status).toBe(200)
    await expect(voteResponse.json()).resolves.toMatchObject({
      poll: {
        viewerOptionId: alphaOption?.id,
        totalVotes: 1,
      },
    })
  })
})
