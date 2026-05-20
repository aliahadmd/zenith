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

  const from = env.NOTIFICATION_EMAIL_FROM || 'no-reply@aliahad.com'
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

export async function sendOtpEmail(env: Env, email: string, otp: string) {
  await sendTransactionalEmail(env, {
    to: email,
    subject: 'Your Zenith sign-in code',
    text: [
      `Your Zenith sign-in code is ${otp}.`,
      '',
      'This code expires in 5 minutes. If you did not request it, you can ignore this email.',
    ].join('\n'),
  })
}
