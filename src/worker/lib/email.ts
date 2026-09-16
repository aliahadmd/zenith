import { EmailMessage } from 'cloudflare:email'
import { createMimeMessage } from 'mimetext/browser'

type TransactionalEmailInput = {
  to: string
  subject: string
  text: string
}

export function emailBaseUrl(env: Env, origin?: string) {
  const configured = env.NOTIFICATION_EMAIL_BASE_URL?.trim()
  return configured || origin || ''
}

export function absoluteEmailUrl(env: Env, targetUrl: string | null | undefined, origin?: string) {
  if (!targetUrl) return null
  if (/^https?:\/\//.test(targetUrl)) return targetUrl
  const base = emailBaseUrl(env, origin)
  if (!base) return targetUrl
  return new URL(targetUrl, base).toString()
}

export function hasTransactionalEmail(env: Env) {
  return Boolean(env.NOTIFICATION_EMAIL)
}

export async function sendTransactionalEmail(env: Env, input: TransactionalEmailInput) {
  const binding = env.NOTIFICATION_EMAIL
  if (!binding) throw new Error('Email binding is not configured')

  const from = env.NOTIFICATION_EMAIL_FROM || 'hi@noreply.aliahad.com'
  const fromName = env.NOTIFICATION_EMAIL_FROM_NAME || 'Zenith'
  const msg = createMimeMessage()
  msg.setSender({ name: fromName, addr: from })
  msg.setRecipient(input.to)
  msg.setSubject(input.subject)
  msg.addMessage({
    contentType: 'text/plain',
    data: input.text,
  })

  await binding.send(new EmailMessage(from, input.to, msg.asRaw()))
}

export async function sendVerificationEmail(env: Env, email: string, verificationUrl: string) {
  await sendTransactionalEmail(env, {
    to: email,
    subject: 'Verify your Zenith email',
    text: [
      'Welcome to Zenith! Confirm your email address to activate your account.',
      '',
      `Verify your email: ${verificationUrl}`,
      '',
      'This link expires in 1 hour. If you did not create a Zenith account, you can ignore this email.',
    ].join('\n'),
  })
}

export async function sendPasswordResetEmail(env: Env, email: string, resetUrl: string) {
  await sendTransactionalEmail(env, {
    to: email,
    subject: 'Reset your Zenith password',
    text: [
      'We received a request to reset your Zenith password.',
      '',
      `Reset your password: ${resetUrl}`,
      '',
      'This link expires in 1 hour. If you did not request a reset, you can ignore this email and your password will stay unchanged.',
    ].join('\n'),
  })
}
