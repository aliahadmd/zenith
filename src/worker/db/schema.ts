import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// ── Users ──────────────────────────────────────────────────────────────────
export const users = sqliteTable('users', {
  id:           text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email:        text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
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
})

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
export type Post                 = typeof posts.$inferSelect
export type Follow               = typeof follows.$inferSelect
export type CreatorApplication   = typeof creatorApplications.$inferSelect
export type NewCreatorApplication = typeof creatorApplications.$inferInsert
