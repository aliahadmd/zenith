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
import { createDb } from '../db/client'
import { storeSignInOtp } from '../lib/auth-otp'

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

async function signInWithOtp(email = `user-${crypto.randomUUID()}@example.com`) {
  const otp = '123456'
  await storeSignInOtp(createDb(env.DB), email, otp)
  const response = await SELF.fetch('https://example.com/api/auth/otp/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp }),
  })
  expect(response.status).toBe(200)
  return { response, cookie: getCookieHeader(response) }
}

async function registerAndUpgradeCreator() {
  const email = `creator-${crypto.randomUUID()}@example.com`
  const { cookie } = await signInWithOtp(email)

  const meResponse = await SELF.fetch('https://example.com/api/auth/me', {
    headers: { Cookie: cookie },
  })
  expect(meResponse.status).toBe(200)
  const user = await meResponse.json() as { id: string; email: string; role: string; username: string }

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
  await env.DB.prepare("UPDATE creator_applications SET status = 'approved' WHERE user_id = ?").bind(user.id).run()
  await env.DB.prepare("UPDATE users SET role = 'creator' WHERE id = ?").bind(user.id).run()

  return { cookie, user }
}

describe('Better Auth integration', () => {
  beforeAll(async () => {
    await applyMigration(migration0)
    await applyMigration(migration1)
    await applyMigration(migration2)
    await applyMigration(migration3)
    await applyMigration(migration4)
    await applyMigration(migration5)
    await applyMigration(migration6)
    await applyMigration(migration7)
    await applyMigration(migration8)
    await applyMigration(migration9)
    await applyMigration(migration10)
    await applyMigration(migration11)
    await applyMigration(migration12)
  })

  it('rejects legacy password auth endpoints', async () => {
    const registerResponse = await SELF.fetch('https://example.com/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `legacy-${crypto.randomUUID()}@example.com`, password: 'password123' }),
    })
    expect(registerResponse.status).toBe(400)
    await expect(registerResponse.json()).resolves.toMatchObject({
      error: { code: 'password_auth_disabled' },
    })

    const loginResponse = await SELF.fetch('https://example.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@example.com', password: 'password123' }),
    })
    expect(loginResponse.status).toBe(400)
    await expect(loginResponse.json()).resolves.toMatchObject({
      error: { code: 'password_auth_disabled' },
    })
  })

  it('creates a subscriber session with OTP', async () => {
    const email = `otp-${crypto.randomUUID()}@example.com`
    const { response, cookie } = await signInWithOtp(email)
    expect(cookie).toContain('better-auth')
    await expect(response.clone().json()).resolves.toMatchObject({
      email,
      role: 'subscriber',
    })
  })

  it('blocks native OTP sign-in from self-assigning creator role', async () => {
    const email = `native-${crypto.randomUUID()}@example.com`
    const otp = '123456'
    await storeSignInOtp(createDb(env.DB), email, otp)

    const nativeResponse = await SELF.fetch('https://example.com/api/auth/sign-in/email-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        otp,
        name: 'Native Bypass',
        role: 'creator',
        username: `u${crypto.randomUUID().replaceAll('-', '').slice(0, 9)}`,
      }),
    })

    expect(nativeResponse.status).toBe(404)

    const wrappedResponse = await SELF.fetch('https://example.com/api/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp }),
    })
    expect(wrappedResponse.status).toBe(200)
    await expect(wrappedResponse.json()).resolves.toMatchObject({
      email,
      role: 'subscriber',
    })
  })

  it('keeps the session usable after an administrator approves a creator', async () => {
    const email = `creator-${crypto.randomUUID()}@example.com`

    const { cookie } = await signInWithOtp(email)
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
    await expect(applyResponse.json()).resolves.toEqual({ application: { status: 'pending' } })

    const pendingMeResponse = await SELF.fetch('https://example.com/api/auth/me', { headers: { Cookie: cookie } })
    const pendingMe = await pendingMeResponse.json() as { id: string; role: string }
    expect(pendingMe).toMatchObject({ role: 'subscriber' })

    const pendingApplication = await env.DB.prepare('SELECT id FROM creator_applications WHERE user_id = ?').bind(
      pendingMe.id,
    ).first<{ id: string }>()
    expect(pendingApplication?.id).toBeTruthy()
    await env.DB.prepare("UPDATE creator_applications SET status = 'approved' WHERE id = ?").bind(pendingApplication!.id).run()
    await env.DB.prepare("UPDATE users SET role = 'creator' WHERE email = ?").bind(email).run()

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

    const editReplyResponse = await SELF.fetch(`https://example.com/api/replies/${replyJson.reply.id}`, {
      method: 'PATCH',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: 'Thanks for joining the discussion.' }),
    })
    expect(editReplyResponse.status).toBe(200)
    await expect(editReplyResponse.json()).resolves.toMatchObject({
      reply: {
        id: replyJson.reply.id,
        body: 'Thanks for joining the discussion.',
        viewerCanManage: true,
      },
    })

    const nestedReplyResponse = await SELF.fetch(`https://example.com/api/posts/${postJson.id}/replies`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: 'A nested follow-up.', parentReplyId: replyJson.reply.id }),
    })
    expect(nestedReplyResponse.status).toBe(201)
    const nestedReply = await nestedReplyResponse.json() as { reply: { id: string; parentReplyId: string } }
    expect(nestedReply.reply.parentReplyId).toBe(replyJson.reply.id)

    const deleteReplyResponse = await SELF.fetch(`https://example.com/api/replies/${replyJson.reply.id}`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    })
    expect(deleteReplyResponse.status).toBe(200)
    await expect(deleteReplyResponse.json()).resolves.toEqual({ deleted: true })

    const discussionResponse = await SELF.fetch(`https://example.com/api/posts/${postJson.id}/replies`, {
      headers: { Cookie: cookie },
    })
    expect(discussionResponse.status).toBe(200)
    await expect(discussionResponse.json()).resolves.toMatchObject({
      replies: [
        { id: replyJson.reply.id, body: '', author: null, isDeleted: true, viewerCanManage: false },
        { id: nestedReply.reply.id, parentReplyId: replyJson.reply.id, body: 'A nested follow-up.' },
      ],
    })

    const deletedReplyLikeResponse = await SELF.fetch(`https://example.com/api/replies/${replyJson.reply.id}/like`, {
      method: 'POST',
      headers: { Cookie: cookie },
    })
    expect(deletedReplyLikeResponse.status).toBe(404)

    const mediaCommentForm = new FormData()
    mediaCommentForm.append('body', 'Comment with a removable photo.')
    mediaCommentForm.append('images', new File(['discussion image'], 'discussion.png', { type: 'image/png' }))
    const mediaCommentResponse = await SELF.fetch(`https://example.com/api/posts/${postJson.id}/replies`, {
      method: 'POST',
      headers: { Cookie: cookie },
      body: mediaCommentForm,
    })
    expect(mediaCommentResponse.status).toBe(201)
    const mediaComment = await mediaCommentResponse.json() as { reply: { id: string } }
    const storedCommentImage = await env.DB.prepare('SELECT r2_key AS r2Key FROM reply_attachments WHERE reply_id = ?')
      .bind(mediaComment.reply.id)
      .first<{ r2Key: string }>()
    expect(storedCommentImage?.r2Key).toBeTruthy()
    await expect(env.STORAGE.get(storedCommentImage!.r2Key)).resolves.not.toBeNull()

    const deleteMediaCommentResponse = await SELF.fetch(`https://example.com/api/replies/${mediaComment.reply.id}`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    })
    expect(deleteMediaCommentResponse.status).toBe(200)
    await expect(env.STORAGE.get(storedCommentImage!.r2Key)).resolves.toBeNull()
    await expect(
      env.DB.prepare('SELECT id FROM reply_attachments WHERE reply_id = ?').bind(mediaComment.reply.id).first(),
    ).resolves.toBeNull()

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

    const albumForm = new FormData()
    albumForm.append('kind', 'album')
    albumForm.append('title', 'Integration Sessions')
    albumForm.append('description', 'Private test album')
    albumForm.append('status', 'published')
    albumForm.append('cover', new File(['cover image'], 'cover.jpg', { type: 'image/jpeg' }))

    const albumResponse = await SELF.fetch('https://example.com/api/audio/collections', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: albumForm,
    })
    expect(albumResponse.status).toBe(201)
    const albumJson = await albumResponse.json() as { collection: { id: string; slug: string; kind: string } }
    expect(albumJson.collection).toMatchObject({ kind: 'album', slug: 'integration-sessions' })

    const trackForm = new FormData()
    trackForm.append('collectionId', albumJson.collection.id)
    trackForm.append('title', 'Range Request Track')
    trackForm.append('description', 'Audio streaming test')
    trackForm.append('status', 'published')
    trackForm.append('durationSeconds', '42')
    trackForm.append('audio', new File(['0123456789'], 'track.mp3', { type: 'audio/mpeg' }))

    const trackResponse = await SELF.fetch('https://example.com/api/audio/items', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: trackForm,
    })
    expect(trackResponse.status).toBe(201)
    const trackJson = await trackResponse.json() as {
      item: {
        id: string
        postId: string
        slug: string
        title: string
        streamUrl: string
      }
    }
    expect(trackJson.item).toMatchObject({
      slug: 'range-request-track',
      title: 'Range Request Track',
    })

    const trackDetailResponse = await SELF.fetch(`https://example.com/api/audio/items/by-slug/${initialUser.username}/${trackJson.item.slug}`, {
      headers: { Cookie: cookie },
    })
    expect(trackDetailResponse.status).toBe(200)
    await expect(trackDetailResponse.json()).resolves.toMatchObject({
      item: {
        postId: trackJson.item.postId,
        likeCount: 0,
        replyCount: 0,
      },
      replies: [],
    })

    const trackLikeResponse = await SELF.fetch(`https://example.com/api/posts/${trackJson.item.postId}/like`, {
      method: 'POST',
      headers: { Cookie: cookie },
    })
    expect(trackLikeResponse.status).toBe(200)
    await expect(trackLikeResponse.json()).resolves.toEqual({ likeCount: 1, viewerLiked: true })

    const streamResponse = await SELF.fetch(`https://example.com/api/audio/items/${trackJson.item.id}/stream`, {
      headers: {
        Cookie: cookie,
        Range: 'bytes=0-3',
      },
    })
    expect(streamResponse.status).toBe(206)
    expect(streamResponse.headers.get('content-range')).toBe('bytes 0-3/10')
    expect(streamResponse.headers.get('content-type')).toBe('audio/mpeg')
    const streamedBytes = await streamResponse.arrayBuffer()
    expect(new TextDecoder().decode(streamedBytes)).toBe('0123')
  })

  it('lets creators publish a private photography album with previews and originals', async () => {
    const { cookie, user } = await registerAndUpgradeCreator()

    const albumForm = new FormData()
    albumForm.append('title', 'Field Notes')
    albumForm.append('description', 'A private set for members.')
    albumForm.append('status', 'draft')
    albumForm.append('downloadsEnabled', 'true')

    const createAlbumResponse = await SELF.fetch('https://example.com/api/photography/albums', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: albumForm,
    })
    expect(createAlbumResponse.status).toBe(201)
    const createAlbumJson = await createAlbumResponse.json() as { album: { id: string; slug: string } }

    const photosForm = new FormData()
    photosForm.append('previews', new File(['preview'], 'preview.jpg', { type: 'image/jpeg' }))
    photosForm.append('originals', new File(['raw'], 'capture.dng', { type: 'application/octet-stream' }))
    photosForm.append('metadata', JSON.stringify([{
      title: 'First frame',
      caption: 'Golden hour study.',
      altText: 'A golden hour landscape.',
      originalDownloadEnabled: true,
    }]))

    const uploadResponse = await SELF.fetch(`https://example.com/api/photography/albums/${createAlbumJson.album.id}/photos`, {
      method: 'POST',
      headers: { Cookie: cookie },
      body: photosForm,
    })
    expect(uploadResponse.status).toBe(201)
    const uploadJson = await uploadResponse.json() as { photos: Array<{ id: string }> }
    const photoId = uploadJson.photos[0].id

    const publishForm = new FormData()
    publishForm.append('title', 'Field Notes')
    publishForm.append('description', 'A private set for members.')
    publishForm.append('status', 'published')
    publishForm.append('downloadsEnabled', 'true')
    publishForm.append('coverPhotoId', photoId)

    const publishResponse = await SELF.fetch(`https://example.com/api/photography/albums/${createAlbumJson.album.id}`, {
      method: 'PATCH',
      headers: { Cookie: cookie },
      body: publishForm,
    })
    expect(publishResponse.status).toBe(200)
    const publishJson = await publishResponse.json() as { album: { postId: string; status: string; coverUrl: string | null } }
    expect(publishJson.album.status).toBe('published')
    expect(publishJson.album.coverUrl).toBe(`/api/photography/photos/${photoId}/preview`)

    const detailResponse = await SELF.fetch(`https://example.com/api/photography/albums/by-slug/${user.username}/${createAlbumJson.album.slug}`, {
      headers: { Cookie: cookie },
    })
    expect(detailResponse.status).toBe(200)
    await expect(detailResponse.json()).resolves.toMatchObject({
      album: {
        title: 'Field Notes',
        photoCount: 1,
        likeCount: 0,
      },
      photos: [{ id: photoId, originalUrl: `/api/photography/photos/${photoId}/original` }],
      replies: [],
    })

    const previewResponse = await SELF.fetch(`https://example.com/api/photography/photos/${photoId}/preview`, {
      headers: { Cookie: cookie },
    })
    expect(previewResponse.status).toBe(200)
    expect(previewResponse.headers.get('content-type')).toBe('image/jpeg')

    const originalResponse = await SELF.fetch(`https://example.com/api/photography/photos/${photoId}/original`, {
      headers: { Cookie: cookie },
    })
    expect(originalResponse.status).toBe(200)
    expect(originalResponse.headers.get('content-disposition')).toContain('attachment')

    const likeResponse = await SELF.fetch(`https://example.com/api/posts/${publishJson.album.postId}/like`, {
      method: 'POST',
      headers: { Cookie: cookie },
    })
    expect(likeResponse.status).toBe(200)
    await expect(likeResponse.json()).resolves.toEqual({ likeCount: 1, viewerLiked: true })
  })
})
