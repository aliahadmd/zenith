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

// ── Inferred types ─────────────────────────────────────────────────────────
export type User    = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Post    = typeof posts.$inferSelect
export type Follow  = typeof follows.$inferSelect
