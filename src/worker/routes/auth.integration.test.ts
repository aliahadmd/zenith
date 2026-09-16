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
import { passwordSignIn, registerVerifiedUser, signIn, TEST_PASSWORD, uniqueEmail } from '../testing/auth'

async function applyMigration(sql: string) {
  const statements = sql
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean)

  for (const statement of statements) {
    await env.DB.prepare(statement).run()
  }
}

async function registerAndUpgradeCreator() {
  const email = uniqueEmail('creator')
  const { cookie, user } = await signIn(email)

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
    await applyMigration(migration13)
    await applyMigration(migration14)
    await applyMigration(migration15)
  })

  it('rejects the removed OTP sign-in endpoints', async () => {
    const requestResponse = await SELF.fetch('https://example.com/api/auth/otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: uniqueEmail('otp') }),
    })
    expect(requestResponse.status).toBe(404)

    const verifyResponse = await SELF.fetch('https://example.com/api/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: uniqueEmail('otp'), otp: '123456' }),
    })
    expect(verifyResponse.status).toBe(404)
  })

  it('registers an unverified account and blocks sign-in until the email is verified', async () => {
    const email = uniqueEmail('pending')

    const registerResponse = await SELF.fetch('https://example.com/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: TEST_PASSWORD }),
    })
    expect(registerResponse.status).toBe(200)
    await expect(registerResponse.json()).resolves.toMatchObject({ success: true, email })

    const row = await env.DB.prepare('SELECT email_verified, role, username FROM users WHERE email = ?')
      .bind(email)
      .first<{ email_verified: number; role: string; username: string }>()
    expect(row).toMatchObject({ email_verified: 0, role: 'subscriber' })
    expect(row?.username).toBeTruthy()

    const unverifiedLogin = await SELF.fetch('https://example.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: TEST_PASSWORD }),
    })
    expect(unverifiedLogin.status).toBe(403)
    await expect(unverifiedLogin.json()).resolves.toMatchObject({
      error: { code: 'email_not_verified' },
    })

    const resendResponse = await SELF.fetch('https://example.com/api/auth/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    expect(resendResponse.status).toBe(200)
    await expect(resendResponse.json()).resolves.toMatchObject({ success: true })

    // Resending for an unknown address still succeeds so accounts can't be enumerated.
    const unknownResend = await SELF.fetch('https://example.com/api/auth/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: uniqueEmail('unknown') }),
    })
    expect(unknownResend.status).toBe(200)
  })

  it('signs in with a password after verification and keeps native sign-up blocked', async () => {
    const email = uniqueEmail('password')
    await registerVerifiedUser(email)

    const wrongPassword = await SELF.fetch('https://example.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'wrong-password' }),
    })
    expect(wrongPassword.status).toBe(401)
    await expect(wrongPassword.json()).resolves.toMatchObject({
      error: { code: 'invalid_credentials' },
    })

    const { response, cookie } = await passwordSignIn(email)
    expect(cookie).toContain('better-auth')
    await expect(response.json()).resolves.toMatchObject({
      email,
      role: 'subscriber',
    })

    const nativeSignUp = await SELF.fetch('https://example.com/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: uniqueEmail('native'),
        password: TEST_PASSWORD,
        name: 'Native Bypass',
        role: 'creator',
        username: `u${crypto.randomUUID().replaceAll('-', '').slice(0, 9)}`,
      }),
    })
    expect(nativeSignUp.status).toBe(404)

    // Duplicate registration answers success without creating a second account.
    const duplicateRegister = await SELF.fetch('https://example.com/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: TEST_PASSWORD }),
    })
    expect(duplicateRegister.status).toBe(200)
    const accountCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM users WHERE email = ?')
      .bind(email)
      .first<{ count: number }>()
    expect(accountCount?.count).toBe(1)
  })

  it('blocks password sign-in for suspended accounts', async () => {
    const email = uniqueEmail('suspended')
    await registerVerifiedUser(email)
    await env.DB.prepare("UPDATE users SET account_status = 'suspended' WHERE email = ?").bind(email).run()

    const loginResponse = await SELF.fetch('https://example.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: TEST_PASSWORD }),
    })
    expect(loginResponse.status).toBe(403)
    await expect(loginResponse.json()).resolves.toMatchObject({
      error: { code: 'account_suspended' },
    })
  })

  it('supports forgot, reset, and change password flows', async () => {
    const email = uniqueEmail('reset')
    const { cookie } = await signIn(email)

    const forgotResponse = await SELF.fetch('https://example.com/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    expect(forgotResponse.status).toBe(200)
    await expect(forgotResponse.json()).resolves.toMatchObject({ success: true })

    // Forgot-password for an unknown address still succeeds (no enumeration).
    const unknownForgot = await SELF.fetch('https://example.com/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: uniqueEmail('unknown') }),
    })
    expect(unknownForgot.status).toBe(200)

    const nativeResetRequest = await SELF.fetch('https://example.com/api/auth/request-password-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    expect(nativeResetRequest.status).toBe(404)

    const badReset = await SELF.fetch('https://example.com/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'not-a-real-token', password: 'new-password-1', confirmPassword: 'new-password-1' }),
    })
    expect(badReset.status).toBe(400)
    await expect(badReset.json()).resolves.toMatchObject({
      error: { code: 'invalid_reset_token' },
    })

    const changeResponse = await SELF.fetch('https://example.com/api/auth/change-password', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: 'https://example.com' },
      body: JSON.stringify({ currentPassword: TEST_PASSWORD, newPassword: 'rotated-password-1' }),
    })
    expect(changeResponse.status).toBe(200)

    const oldPasswordLogin = await SELF.fetch('https://example.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: TEST_PASSWORD }),
    })
    expect(oldPasswordLogin.status).toBe(401)

    await passwordSignIn(email, 'rotated-password-1')
  })

  it('delivers reset links through the email redirect route and completes the reset', async () => {
    const email = uniqueEmail('resetlink')
    const { user } = await signIn(email)

    // Seed the verification value the same way request-password-reset does,
    // since the local email binding cannot deliver the message.
    const token = crypto.randomUUID().replaceAll('-', '')
    await env.DB.prepare(
      "INSERT INTO verification (id, identifier, value, expires_at) VALUES (?, ?, ?, ?)",
    ).bind(crypto.randomUUID(), `reset-password:${token}`, user.id, Date.now() + 60 * 60 * 1000).run()

    // The email link hits the native GET route, which must redirect into the
    // SPA with the token instead of answering the blocked-paths 404.
    const emailLink = await SELF.fetch(
      `https://example.com/api/auth/reset-password/${token}?callbackURL=${encodeURIComponent('https://example.com/reset-password')}`,
      { redirect: 'manual' },
    )
    expect(emailLink.status).toBe(302)
    const location = emailLink.headers.get('location') ?? ''
    expect(location.startsWith('https://example.com/reset-password?')).toBe(true)
    expect(location).toContain(`token=${token}`)

    // A bogus token still redirects, but flags the error for the SPA.
    const bogusLink = await SELF.fetch(
      `https://example.com/api/auth/reset-password/not-a-real-token?callbackURL=${encodeURIComponent('https://example.com/reset-password')}`,
      { redirect: 'manual' },
    )
    expect(bogusLink.status).toBe(302)
    expect(bogusLink.headers.get('location') ?? '').toContain('error=INVALID_TOKEN')

    // Completing the reset through the custom endpoint yields a working password.
    const resetResponse = await SELF.fetch('https://example.com/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password: 'reset-via-email-link-1', confirmPassword: 'reset-via-email-link-1' }),
    })
    expect(resetResponse.status).toBe(200)

    await passwordSignIn(email, 'reset-via-email-link-1')
  })

  it('keeps the session usable after an administrator approves a creator', async () => {
    const email = uniqueEmail('creator')

    const { cookie } = await signIn(email)
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
