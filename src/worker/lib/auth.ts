import { betterAuth } from 'better-auth'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { createDb } from '../db/client'
import * as schema from '../db/schema'
import { hashPassword, verifyPassword } from './crypto'

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
      minPasswordLength: 8,
      password: {
        hash: hashPassword,
        verify: ({ hash, password }) => verifyPassword(password, hash),
      },
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
