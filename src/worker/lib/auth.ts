import { betterAuth } from 'better-auth'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { createDb } from '../db/client'
import * as schema from '../db/schema'
import { sendPasswordResetEmail, sendVerificationEmail } from './email'

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
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendPasswordResetEmail(env, user.email, url)
      },
    },
    emailVerification: {
      // Verification links must keep working even when the email binding
      // hiccups — the account exists and the user can retry via resend.
      sendVerificationEmail: async ({ user, url }) => {
        try {
          await sendVerificationEmail(env, user.email, url)
        } catch (error) {
          console.error(JSON.stringify({
            event: 'verification_email_failed',
            userId: user.id,
            error: error instanceof Error ? error.message : String(error),
          }))
        }
      },
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60,
    },
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
