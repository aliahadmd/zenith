import { betterAuth } from 'better-auth'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { emailOTP } from 'better-auth/plugins'
import { createDb } from '../db/client'
import * as schema from '../db/schema'
import { hashOtp, OTP_EXPIRES_SECONDS, OTP_LENGTH, OTP_MAX_ATTEMPTS } from './auth-otp'
import { sendOtpEmail } from './email'

export function createAuth(env: Env, baseURL: string) {
  const db = createDb(env.DB)

  return betterAuth({
    baseURL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [baseURL],
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: {
        ...schema,
        user: schema.users,
      },
    }),
    emailAndPassword: {
      enabled: false,
    },
    plugins: [
      emailOTP({
        otpLength: OTP_LENGTH,
        expiresIn: OTP_EXPIRES_SECONDS,
        allowedAttempts: OTP_MAX_ATTEMPTS,
        storeOTP: {
          hash: hashOtp,
        },
        sendVerificationOTP: async ({ email, otp }) => {
          await sendOtpEmail(env, email, otp)
        },
      }),
    ],
    user: {
      fields: {
        name: 'displayName',
        image: 'avatarUrl',
      },
      additionalFields: {
        passwordHash: {
          type: 'string',
          input: false,
          returned: false,
          defaultValue: '',
        },
        role: {
          type: 'string',
          input: false,
          required: true,
          defaultValue: 'subscriber',
        },
        username: {
          type: 'string',
          required: true,
        },
        tagline: {
          type: 'string',
          required: false,
        },
        avatarR2Key: {
          type: 'string',
          required: false,
          returned: false,
        },
        socialLinks: {
          type: 'string',
          required: false,
        },
      },
    },
  })
}

export type AppAuth = ReturnType<typeof createAuth>
