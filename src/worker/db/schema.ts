import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// ── Users ──────────────────────────────────────────────────────────────────
export const users = sqliteTable('users', {
  id:           text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email:        text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  role:         text('role', { enum: ['subscriber', 'creator'] })
                  .notNull()
                  .default('subscriber'),
  displayName:  text('display_name').notNull(),
  username:     text('username').notNull().unique(),
  tagline:      text('tagline'),
  avatarUrl:    text('avatar_url'),
  avatarR2Key:  text('avatar_r2_key'),
  socialLinks:  text('social_links'),
  createdAt:    integer('created_at', { mode: 'timestamp' })
                  .notNull()
                  .default(sql`(unixepoch())`),
  updatedAt:    integer('updated_at', { mode: 'timestamp_ms' })
                  .notNull()
                  .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
                  .$onUpdate(() => new Date()),
})

// ── Better Auth Sessions ───────────────────────────────────────────────────
export const session = sqliteTable('session', {
  id:        text('id').primaryKey(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  token:     text('token').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
               .notNull()
               .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
               .notNull()
               .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
               .$onUpdate(() => new Date()),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId:    text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
}, (t) => [
  index('session_user_id_idx').on(t.userId),
])

// ── Better Auth Accounts ───────────────────────────────────────────────────
export const account = sqliteTable('account', {
  id:                    text('id').primaryKey(),
  accountId:             text('account_id').notNull(),
  providerId:            text('provider_id').notNull(),
  userId:                text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accessToken:           text('access_token'),
  refreshToken:          text('refresh_token'),
  idToken:               text('id_token'),
  accessTokenExpiresAt:  integer('access_token_expires_at', { mode: 'timestamp_ms' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
  scope:                 text('scope'),
  password:              text('password'),
  createdAt:             integer('created_at', { mode: 'timestamp_ms' })
                            .notNull()
                            .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
  updatedAt:             integer('updated_at', { mode: 'timestamp_ms' })
                            .notNull()
                            .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
                            .$onUpdate(() => new Date()),
}, (t) => [
  index('account_user_id_idx').on(t.userId),
])

// ── Better Auth Verification Tokens ────────────────────────────────────────
export const verification = sqliteTable('verification', {
  id:         text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value:      text('value').notNull(),
  expiresAt:  integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt:  integer('created_at', { mode: 'timestamp_ms' })
                .notNull()
                .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
  updatedAt:  integer('updated_at', { mode: 'timestamp_ms' })
                .notNull()
                .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
                .$onUpdate(() => new Date()),
}, (t) => [
  index('verification_identifier_idx').on(t.identifier),
])

// ── Posts ──────────────────────────────────────────────────────────────────
export const posts = sqliteTable('posts', {
  id:        text('id').primaryKey(),
  authorId:  text('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  body:      text('body').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
               .notNull()
               .default(sql`(unixepoch())`),
}, (t) => [
  index('posts_author_created_idx').on(t.authorId, t.createdAt),
])

// ── Follows ────────────────────────────────────────────────────────────────
export const follows = sqliteTable('follows', {
  followerId: text('follower_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  followeeId: text('followee_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt:  integer('created_at', { mode: 'timestamp' })
                .notNull()
                .default(sql`(unixepoch())`),
}, (t) => [
  primaryKey({ columns: [t.followerId, t.followeeId] }),
  index('follows_follower_idx').on(t.followerId),
  index('follows_followee_idx').on(t.followeeId),
])

// ── Creator Applications ───────────────────────────────────────────────────
export const creatorApplications = sqliteTable('creator_applications', {
  id:               text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId:           text('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  fullName:         text('full_name').notNull(),
  address:          text('address').notNull(),
  city:             text('city').notNull(),
  country:          text('country').notNull(),
  nidNumber:        text('nid_number').notNull(),
  nidDocumentR2Key: text('nid_document_r2_key').notNull(),
  socialLinks:      text('social_links').notNull(),   // JSON array of URL strings
  contentLinks:     text('content_links').notNull(),  // JSON array of URL strings
  status:           text('status', { enum: ['pending', 'approved', 'rejected'] })
                      .notNull()
                      .default('approved'),
  createdAt:        integer('created_at', { mode: 'timestamp' })
                      .notNull()
                      .default(sql`(unixepoch())`),
})

// ── Inferred types ─────────────────────────────────────────────────────────
export type User                 = typeof users.$inferSelect
export type NewUser              = typeof users.$inferInsert
export type Session              = typeof session.$inferSelect
export type Account              = typeof account.$inferSelect
export type Verification         = typeof verification.$inferSelect
export type Post                 = typeof posts.$inferSelect
export type Follow               = typeof follows.$inferSelect
export type CreatorApplication   = typeof creatorApplications.$inferSelect
export type NewCreatorApplication = typeof creatorApplications.$inferInsert
