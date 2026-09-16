import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { verification } from '../db/schema'

export const OTP_LENGTH = 6
export const OTP_EXPIRES_SECONDS = 300
export const OTP_MAX_ATTEMPTS = 3

const textEncoder = new TextEncoder()

function base64Url(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index)
  }
  return diff === 0
}

export function generateOtp() {
  let otp = ''
  while (otp.length < OTP_LENGTH) {
    const bytes = new Uint8Array(OTP_LENGTH)
    crypto.getRandomValues(bytes)
    for (const byte of bytes) {
      if (byte >= 250) continue
      otp += String(byte % 10)
      if (otp.length === OTP_LENGTH) break
    }
  }
  return otp
}

export async function hashOtp(otp: string) {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(otp))
  return base64Url(new Uint8Array(digest))
}

function emailChangeOtpIdentifier(userId: string, newEmail: string) {
  return `change-email-otp-${userId}-${newEmail}`
}

function expiresAt() {
  return new Date(Date.now() + OTP_EXPIRES_SECONDS * 1000)
}

async function storeOtp(db: Db, identifier: string, otp: string) {
  await db.delete(verification).where(eq(verification.identifier, identifier)).run()
  await db.insert(verification).values({
    id: crypto.randomUUID(),
    identifier,
    value: `${await hashOtp(otp)}:0`,
    expiresAt: expiresAt(),
  }).run()
}

export async function storeEmailChangeOtp(db: Db, userId: string, newEmail: string, otp: string) {
  await storeOtp(db, emailChangeOtpIdentifier(userId, newEmail), otp)
}

export async function deleteEmailChangeOtp(db: Db, userId: string, newEmail: string) {
  await db.delete(verification).where(eq(verification.identifier, emailChangeOtpIdentifier(userId, newEmail))).run()
}

export type OtpVerificationResult =
  | { ok: true }
  | { ok: false; code: 'invalid_otp' | 'otp_expired' | 'too_many_attempts' }

export async function verifyEmailChangeOtp(
  db: Db,
  userId: string,
  newEmail: string,
  otp: string,
): Promise<OtpVerificationResult> {
  const identifier = emailChangeOtpIdentifier(userId, newEmail)
  const row = await db.select().from(verification).where(eq(verification.identifier, identifier)).get()
  if (!row) return { ok: false, code: 'invalid_otp' }

  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(verification).where(eq(verification.identifier, identifier)).run()
    return { ok: false, code: 'otp_expired' }
  }

  const separatorIndex = row.value.lastIndexOf(':')
  const storedHash = separatorIndex === -1 ? row.value : row.value.slice(0, separatorIndex)
  const attempts = separatorIndex === -1 ? 0 : Number.parseInt(row.value.slice(separatorIndex + 1), 10) || 0

  if (attempts >= OTP_MAX_ATTEMPTS) {
    await db.delete(verification).where(eq(verification.identifier, identifier)).run()
    return { ok: false, code: 'too_many_attempts' }
  }

  const incomingHash = await hashOtp(otp)
  if (!constantTimeEqual(incomingHash, storedHash)) {
    await db
      .update(verification)
      .set({ value: `${storedHash}:${attempts + 1}`, updatedAt: new Date() })
      .where(eq(verification.identifier, identifier))
      .run()
    return { ok: false, code: 'invalid_otp' }
  }

  await db.delete(verification).where(eq(verification.identifier, identifier)).run()
  return { ok: true }
}
