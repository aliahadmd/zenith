import { sqliteTable, text, integer, primaryKey, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
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
  accountStatus: text('account_status', { enum: ['active', 'suspended'] }).notNull().default('active'),
  suspensionReason: text('suspension_reason'),
  suspendedAt: integer('suspended_at', { mode: 'timestamp' }),
  suspendedBy: text('suspended_by'),
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
}, (t) => [
  index('users_account_status_idx').on(t.accountStatus),
])

// ── Administration ────────────────────────────────────────────────────────
export const adminMemberships = sqliteTable('admin_memberships', {
  userId:    text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  role:      text('role', { enum: ['owner', 'moderator'] }).notNull(),
  grantedBy: text('granted_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  index('admin_memberships_role_idx').on(t.role),
])

// ── Creator Profile Tabs ──────────────────────────────────────────────────
export const creatorProfileTabs = sqliteTable('creator_profile_tabs', {
  creatorId:    text('creator_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tabKey:       text('tab_key', { enum: ['all', 'about', 'posts', 'photography', 'audio', 'articles', 'courses', 'subscribers', 'subscribed'] }).notNull(),
  visible:      integer('visible', { mode: 'boolean' }).notNull().default(true),
  displayOrder: integer('display_order').notNull(),
  createdAt:    integer('created_at')
                  .notNull()
                  .default(sql`(unixepoch())`),
  updatedAt:    integer('updated_at', { mode: 'timestamp_ms' })
                  .notNull()
                  .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
                  .$onUpdate(() => new Date()),
}, (t) => [
  primaryKey({ columns: [t.creatorId, t.tabKey] }),
  index('creator_profile_tabs_creator_order_idx').on(t.creatorId, t.displayOrder),
])

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
  kind:      text('kind', { enum: ['post', 'article', 'audio', 'photography', 'course'] }).notNull().default('post'),
  slug:      text('slug').notNull(),
  body:      text('body').notNull(),
  moderationStatus: text('moderation_status', { enum: ['active', 'hidden'] }).notNull().default('active'),
  moderationReason: text('moderation_reason'),
  moderatedAt: integer('moderated_at', { mode: 'timestamp' }),
  moderatedBy: text('moderated_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
               .notNull()
               .default(sql`(unixepoch())`),
}, (t) => [
  uniqueIndex('posts_author_slug_unique').on(t.authorId, t.slug),
  index('posts_kind_created_idx').on(t.kind, t.createdAt),
  index('posts_author_created_idx').on(t.authorId, t.createdAt),
  index('posts_moderation_author_idx').on(t.moderationStatus, t.authorId, t.createdAt),
])

// ── Articles ───────────────────────────────────────────────────────────────
export const articles = sqliteTable('articles', {
  postId:           text('post_id').primaryKey().references(() => posts.id, { onDelete: 'cascade' }),
  title:            text('title').notNull(),
  excerpt:          text('excerpt'),
  markdown:         text('markdown').notNull(),
  status:           text('status', { enum: ['draft', 'published'] }).notNull().default('draft'),
  coverR2Key:       text('cover_r2_key'),
  coverFileName:    text('cover_file_name'),
  coverContentType: text('cover_content_type'),
  coverSizeBytes:   integer('cover_size_bytes'),
  publishedAt:      integer('published_at', { mode: 'timestamp' }),
  createdAt:        integer('created_at', { mode: 'timestamp' })
                      .notNull()
                      .default(sql`(unixepoch())`),
  updatedAt:        integer('updated_at', { mode: 'timestamp_ms' })
                      .notNull()
                      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
                      .$onUpdate(() => new Date()),
}, (t) => [
  index('articles_status_published_idx').on(t.status, t.publishedAt),
])

// ── Audio Collections And Items ────────────────────────────────────────────
export const audioCollections = sqliteTable('audio_collections', {
  id:               text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  creatorId:        text('creator_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind:             text('kind', { enum: ['album', 'podcast'] }).notNull(),
  slug:             text('slug').notNull(),
  title:            text('title').notNull(),
  description:      text('description'),
  status:           text('status', { enum: ['draft', 'published'] }).notNull().default('draft'),
  coverR2Key:       text('cover_r2_key'),
  coverFileName:    text('cover_file_name'),
  coverContentType: text('cover_content_type'),
  coverSizeBytes:   integer('cover_size_bytes'),
  releaseDate:      integer('release_date', { mode: 'timestamp' }),
  createdAt:        integer('created_at', { mode: 'timestamp' })
                      .notNull()
                      .default(sql`(unixepoch())`),
  updatedAt:        integer('updated_at', { mode: 'timestamp_ms' })
                      .notNull()
                      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
                      .$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex('audio_collections_creator_slug_unique').on(t.creatorId, t.slug),
  index('audio_collections_creator_kind_idx').on(t.creatorId, t.kind, t.status),
])

export const audioItems = sqliteTable('audio_items', {
  id:               text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  collectionId:     text('collection_id').notNull().references(() => audioCollections.id, { onDelete: 'cascade' }),
  postId:           text('post_id').notNull().unique().references(() => posts.id, { onDelete: 'cascade' }),
  creatorId:        text('creator_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind:             text('kind', { enum: ['music', 'podcast_episode'] }).notNull(),
  slug:             text('slug').notNull(),
  title:            text('title').notNull(),
  description:      text('description'),
  status:           text('status', { enum: ['draft', 'published'] }).notNull().default('draft'),
  audioR2Key:       text('audio_r2_key'),
  audioFileName:    text('audio_file_name'),
  audioContentType: text('audio_content_type'),
  audioSizeBytes:   integer('audio_size_bytes'),
  coverR2Key:       text('cover_r2_key'),
  coverFileName:    text('cover_file_name'),
  coverContentType: text('cover_content_type'),
  coverSizeBytes:   integer('cover_size_bytes'),
  durationSeconds:  integer('duration_seconds'),
  displayOrder:     integer('display_order').notNull().default(0),
  publishedAt:      integer('published_at', { mode: 'timestamp' }),
  createdAt:        integer('created_at', { mode: 'timestamp' })
                      .notNull()
                      .default(sql`(unixepoch())`),
  updatedAt:        integer('updated_at', { mode: 'timestamp_ms' })
                      .notNull()
                      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
                      .$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex('audio_items_creator_slug_unique').on(t.creatorId, t.slug),
  index('audio_items_collection_order_idx').on(t.collectionId, t.displayOrder),
  index('audio_items_creator_published_idx').on(t.creatorId, t.status, t.publishedAt),
])

// ── Photography Albums And Photos ─────────────────────────────────────────
export const photographyAlbums = sqliteTable('photography_albums', {
  id:               text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  postId:           text('post_id').notNull().unique().references(() => posts.id, { onDelete: 'cascade' }),
  creatorId:        text('creator_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  slug:             text('slug').notNull(),
  title:            text('title').notNull(),
  description:      text('description'),
  status:           text('status', { enum: ['draft', 'published'] }).notNull().default('draft'),
  downloadsEnabled: integer('downloads_enabled', { mode: 'boolean' }).notNull().default(false),
  shootDate:        integer('shoot_date', { mode: 'timestamp' }),
  coverPhotoId:     text('cover_photo_id'),
  publishedAt:      integer('published_at', { mode: 'timestamp' }),
  createdAt:        integer('created_at', { mode: 'timestamp' })
                      .notNull()
                      .default(sql`(unixepoch())`),
  updatedAt:        integer('updated_at', { mode: 'timestamp_ms' })
                      .notNull()
                      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
                      .$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex('photography_albums_creator_slug_unique').on(t.creatorId, t.slug),
  index('photography_albums_creator_published_idx').on(t.creatorId, t.status, t.publishedAt),
])

export const photographyPhotos = sqliteTable('photography_photos', {
  id:                         text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  albumId:                    text('album_id').notNull().references(() => photographyAlbums.id, { onDelete: 'cascade' }),
  creatorId:                  text('creator_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title:                      text('title'),
  caption:                    text('caption'),
  altText:                    text('alt_text'),
  status:                     text('status', { enum: ['draft', 'published'] }).notNull().default('published'),
  previewR2Key:               text('preview_r2_key').notNull(),
  previewFileName:            text('preview_file_name').notNull(),
  previewContentType:         text('preview_content_type').notNull(),
  previewSizeBytes:           integer('preview_size_bytes').notNull(),
  originalR2Key:              text('original_r2_key'),
  originalFileName:           text('original_file_name'),
  originalContentType:        text('original_content_type'),
  originalSizeBytes:          integer('original_size_bytes'),
  originalDownloadEnabled:    integer('original_download_enabled', { mode: 'boolean' }).notNull().default(false),
  width:                      integer('width'),
  height:                     integer('height'),
  displayOrder:               integer('display_order').notNull().default(0),
  createdAt:                  integer('created_at', { mode: 'timestamp' })
                                .notNull()
                                .default(sql`(unixepoch())`),
  updatedAt:                  integer('updated_at', { mode: 'timestamp_ms' })
                                .notNull()
                                .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
                                .$onUpdate(() => new Date()),
}, (t) => [
  index('photography_photos_album_order_idx').on(t.albumId, t.displayOrder),
  index('photography_photos_creator_status_idx').on(t.creatorId, t.status, t.createdAt),
])

// ── Courses ───────────────────────────────────────────────────────────────
export const courses = sqliteTable('courses', {
  id:          text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  postId:      text('post_id').notNull().unique().references(() => posts.id, { onDelete: 'cascade' }),
  creatorId:   text('creator_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  slug:        text('slug').notNull(),
  title:       text('title').notNull(),
  description: text('description'),
  status:      text('status', { enum: ['draft', 'published'] }).notNull().default('draft'),
  publishedAt: integer('published_at', { mode: 'timestamp' }),
  createdAt:   integer('created_at', { mode: 'timestamp' })
                .notNull()
                .default(sql`(unixepoch())`),
  updatedAt:   integer('updated_at', { mode: 'timestamp_ms' })
                .notNull()
                .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
                .$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex('courses_creator_slug_unique').on(t.creatorId, t.slug),
  index('courses_creator_status_published_idx').on(t.creatorId, t.status, t.publishedAt),
])

export const courseModules = sqliteTable('course_modules', {
  id:          text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  courseId:    text('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
  title:       text('title').notNull(),
  description: text('description'),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt:   integer('created_at', { mode: 'timestamp' })
                .notNull()
                .default(sql`(unixepoch())`),
  updatedAt:   integer('updated_at', { mode: 'timestamp_ms' })
                .notNull()
                .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
                .$onUpdate(() => new Date()),
}, (t) => [
  index('course_modules_course_order_idx').on(t.courseId, t.displayOrder),
])

export const courseLessons = sqliteTable('course_lessons', {
  id:            text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  courseId:      text('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
  moduleId:      text('module_id').notNull().references(() => courseModules.id, { onDelete: 'cascade' }),
  title:         text('title').notNull(),
  summary:       text('summary'),
  markdown:      text('markdown').notNull().default(''),
  status:        text('status', { enum: ['draft', 'published'] }).notNull().default('draft'),
  displayOrder:  integer('display_order').notNull().default(0),
  publishedAt:   integer('published_at', { mode: 'timestamp' }),
  createdAt:     integer('created_at', { mode: 'timestamp' })
                  .notNull()
                  .default(sql`(unixepoch())`),
  updatedAt:     integer('updated_at', { mode: 'timestamp_ms' })
                  .notNull()
                  .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
                  .$onUpdate(() => new Date()),
}, (t) => [
  index('course_lessons_module_order_idx').on(t.moduleId, t.displayOrder),
  index('course_lessons_course_status_idx').on(t.courseId, t.status, t.publishedAt),
])

export const courseAttachments = sqliteTable('course_attachments', {
  id:            text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  courseId:      text('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
  lessonId:      text('lesson_id').notNull().references(() => courseLessons.id, { onDelete: 'cascade' }),
  uploaderId:    text('uploader_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind:          text('kind', { enum: ['video', 'audio', 'file'] }).notNull(),
  status:        text('status', { enum: ['pending', 'ready'] }).notNull().default('pending'),
  r2Key:         text('r2_key').notNull().unique(),
  r2UploadId:    text('r2_upload_id'),
  fileName:      text('file_name').notNull(),
  contentType:   text('content_type').notNull(),
  sizeBytes:     integer('size_bytes').notNull(),
  displayOrder:  integer('display_order').notNull().default(0),
  createdAt:     integer('created_at', { mode: 'timestamp' })
                  .notNull()
                  .default(sql`(unixepoch())`),
  updatedAt:     integer('updated_at', { mode: 'timestamp_ms' })
                  .notNull()
                  .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
                  .$onUpdate(() => new Date()),
}, (t) => [
  index('course_attachments_lesson_order_idx').on(t.lessonId, t.displayOrder),
  index('course_attachments_course_status_idx').on(t.courseId, t.status),
])

export const courseLessonProgress = sqliteTable('course_lesson_progress', {
  courseId:   text('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
  lessonId:   text('lesson_id').notNull().references(() => courseLessons.id, { onDelete: 'cascade' }),
  userId:     text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  completedAt: integer('completed_at', { mode: 'timestamp' })
                .notNull()
                .default(sql`(unixepoch())`),
}, (t) => [
  primaryKey({ columns: [t.lessonId, t.userId] }),
  index('course_progress_course_user_idx').on(t.courseId, t.userId),
])

// ── Post Media Attachments ─────────────────────────────────────────────────
export const postAttachments = sqliteTable('post_attachments', {
  id:           text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  postId:       text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  uploaderId:   text('uploader_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  r2Key:        text('r2_key').notNull().unique(),
  fileName:     text('file_name').notNull(),
  contentType:  text('content_type').notNull(),
  sizeBytes:    integer('size_bytes').notNull(),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt:    integer('created_at')
                  .notNull()
                  .default(sql`(unixepoch())`),
}, (t) => [
  index('post_attachments_post_idx').on(t.postId, t.displayOrder),
])

// ── Post Replies ───────────────────────────────────────────────────────────
export const postReplies = sqliteTable('post_replies', {
  id:              text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  postId:          text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  authorId:        text('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  parentReplyId:   text('parent_reply_id'),
  mentionedUserId: text('mentioned_user_id').references(() => users.id, { onDelete: 'set null' }),
  body:            text('body').notNull(),
  editedAt:        integer('edited_at', { mode: 'timestamp' }),
  deletedAt:       integer('deleted_at', { mode: 'timestamp' }),
  moderationStatus: text('moderation_status', { enum: ['active', 'hidden'] }).notNull().default('active'),
  moderationReason: text('moderation_reason'),
  moderatedAt:     integer('moderated_at', { mode: 'timestamp' }),
  moderatedBy:     text('moderated_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt:       integer('created_at', { mode: 'timestamp' })
                     .notNull()
                     .default(sql`(unixepoch())`),
  updatedAt:       integer('updated_at', { mode: 'timestamp_ms' })
                     .notNull()
                     .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
                     .$onUpdate(() => new Date()),
}, (t) => [
  index('post_replies_post_created_idx').on(t.postId, t.createdAt),
  index('post_replies_parent_idx').on(t.parentReplyId),
  index('post_replies_moderation_post_idx').on(t.moderationStatus, t.postId, t.createdAt),
  index('post_replies_post_deleted_created_idx').on(t.postId, t.deletedAt, t.createdAt),
])

export const replyAttachments = sqliteTable('reply_attachments', {
  id:           text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  replyId:      text('reply_id').notNull().references(() => postReplies.id, { onDelete: 'cascade' }),
  uploaderId:   text('uploader_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  r2Key:        text('r2_key').notNull().unique(),
  fileName:     text('file_name').notNull(),
  contentType:  text('content_type').notNull(),
  sizeBytes:    integer('size_bytes').notNull(),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt:    integer('created_at')
                  .notNull()
                  .default(sql`(unixepoch())`),
}, (t) => [
  index('reply_attachments_reply_idx').on(t.replyId, t.displayOrder),
])

export const postLikes = sqliteTable('post_likes', {
  postId:    text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  userId:    text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at')
               .notNull()
               .default(sql`(unixepoch())`),
}, (t) => [
  primaryKey({ columns: [t.postId, t.userId] }),
  index('post_likes_user_idx').on(t.userId),
])

export const replyLikes = sqliteTable('reply_likes', {
  replyId:   text('reply_id').notNull().references(() => postReplies.id, { onDelete: 'cascade' }),
  userId:    text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at')
               .notNull()
               .default(sql`(unixepoch())`),
}, (t) => [
  primaryKey({ columns: [t.replyId, t.userId] }),
  index('reply_likes_user_idx').on(t.userId),
])

// ── Post Polls ─────────────────────────────────────────────────────────────
export const postPolls = sqliteTable('post_polls', {
  id:        text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  postId:    text('post_id').notNull().unique().references(() => posts.id, { onDelete: 'cascade' }),
  question:  text('question').notNull(),
  closesAt:  integer('closes_at'),
  createdAt: integer('created_at')
               .notNull()
               .default(sql`(unixepoch())`),
}, (t) => [
  index('post_polls_post_idx').on(t.postId),
])

export const pollOptions = sqliteTable('poll_options', {
  id:        text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  pollId:    text('poll_id').notNull().references(() => postPolls.id, { onDelete: 'cascade' }),
  text:      text('text').notNull(),
  position:  integer('position').notNull(),
  createdAt: integer('created_at')
               .notNull()
               .default(sql`(unixepoch())`),
}, (t) => [
  index('poll_options_poll_position_idx').on(t.pollId, t.position),
])

export const pollVotes = sqliteTable('poll_votes', {
  pollId:    text('poll_id').notNull().references(() => postPolls.id, { onDelete: 'cascade' }),
  userId:    text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  optionId:  text('option_id').notNull().references(() => pollOptions.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at')
               .notNull()
               .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
               .notNull()
               .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
               .$onUpdate(() => new Date()),
}, (t) => [
  primaryKey({ columns: [t.pollId, t.userId] }),
  index('poll_votes_option_idx').on(t.optionId),
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
                      .default('pending'),
  reviewedBy:       text('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt:       integer('reviewed_at', { mode: 'timestamp' }),
  decisionReason:   text('decision_reason'),
  adminNote:        text('admin_note'),
  resubmittedAt:    integer('resubmitted_at', { mode: 'timestamp' }),
  createdAt:        integer('created_at', { mode: 'timestamp' })
                      .notNull()
                      .default(sql`(unixepoch())`),
  updatedAt:        integer('updated_at', { mode: 'timestamp' })
                      .notNull()
                      .default(sql`(unixepoch())`),
}, (t) => [
  index('creator_applications_status_updated_idx').on(t.status, t.updatedAt),
])

// ── Moderation ────────────────────────────────────────────────────────────
export const moderationCases = sqliteTable('moderation_cases', {
  id:              text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  targetType:      text('target_type', { enum: ['post', 'reply', 'user'] }).notNull(),
  targetId:        text('target_id').notNull(),
  status:          text('status', { enum: ['open', 'reviewing', 'resolved', 'dismissed'] }).notNull().default('open'),
  assignedAdminId: text('assigned_admin_id').references(() => users.id, { onDelete: 'set null' }),
  resolutionAction: text('resolution_action'),
  resolutionNote:  text('resolution_note'),
  resolvedBy:      text('resolved_by').references(() => users.id, { onDelete: 'set null' }),
  resolvedAt:      integer('resolved_at', { mode: 'timestamp' }),
  createdAt:       integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt:       integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  uniqueIndex('moderation_cases_target_unique').on(t.targetType, t.targetId),
  index('moderation_cases_status_updated_idx').on(t.status, t.updatedAt),
])

export const contentReports = sqliteTable('content_reports', {
  id:         text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  caseId:     text('case_id').notNull().references(() => moderationCases.id, { onDelete: 'cascade' }),
  reporterId: text('reporter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  reason:     text('reason', { enum: ['spam', 'harassment', 'hate', 'sexual', 'violence', 'copyright', 'impersonation', 'other'] }).notNull(),
  details:    text('details'),
  createdAt:  integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  uniqueIndex('content_reports_case_reporter_unique').on(t.caseId, t.reporterId),
  index('content_reports_case_created_idx').on(t.caseId, t.createdAt),
])

export const adminAuditLogs = sqliteTable('admin_audit_logs', {
  id:         text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  actorId:    text('actor_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  action:     text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId:   text('target_id').notNull(),
  reason:     text('reason'),
  metadata:   text('metadata'),
  createdAt:  integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  index('admin_audit_logs_created_idx').on(t.createdAt),
  index('admin_audit_logs_actor_created_idx').on(t.actorId, t.createdAt),
])

// ── Creator Payment Accounts ───────────────────────────────────────────────
export const creatorPaymentAccounts = sqliteTable('creator_payment_accounts', {
  creatorId:         text('creator_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  provider:          text('provider', { enum: ['stripe'] }).notNull(),
  providerAccountId: text('provider_account_id').notNull().unique(),
  status:            text('status', { enum: ['not_connected', 'onboarding', 'active', 'restricted'] })
                       .notNull()
                       .default('onboarding'),
  chargesEnabled:    integer('charges_enabled', { mode: 'boolean' }).notNull().default(false),
  payoutsEnabled:    integer('payouts_enabled', { mode: 'boolean' }).notNull().default(false),
  detailsSubmitted:  integer('details_submitted', { mode: 'boolean' }).notNull().default(false),
  requirementsDue:   text('requirements_due'),
  createdAt:         integer('created_at')
                       .notNull()
                       .default(sql`(unixepoch())`),
  updatedAt:         integer('updated_at', { mode: 'timestamp_ms' })
                       .notNull()
                       .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
                       .$onUpdate(() => new Date()),
}, (t) => [
  index('creator_payment_accounts_provider_idx').on(t.provider, t.providerAccountId),
])

// ── Membership Plans ───────────────────────────────────────────────────────
export const membershipPlans = sqliteTable('membership_plans', {
  id:                   text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  creatorId:            text('creator_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  name:                 text('name').notNull().default('Membership'),
  description:          text('description'),
  currency:             text('currency').notNull().default('usd'),
  paidEnabled:          integer('paid_enabled', { mode: 'boolean' }).notNull().default(false),
  freePermanentEnabled: integer('free_permanent_enabled', { mode: 'boolean' }).notNull().default(false),
  freeTrialEnabled:     integer('free_trial_enabled', { mode: 'boolean' }).notNull().default(false),
  freeTrialDays:        integer('free_trial_days'),
  createdAt:            integer('created_at')
                          .notNull()
                          .default(sql`(unixepoch())`),
  updatedAt:            integer('updated_at', { mode: 'timestamp_ms' })
                          .notNull()
                          .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
                          .$onUpdate(() => new Date()),
}, (t) => [
  index('membership_plans_creator_idx').on(t.creatorId),
])

export const membershipPlanPrices = sqliteTable('membership_plan_prices', {
  id:                text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  planId:            text('plan_id').notNull().references(() => membershipPlans.id, { onDelete: 'cascade' }),
  creatorId:         text('creator_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider:          text('provider', { enum: ['stripe'] }).notNull(),
  interval:          text('interval', { enum: ['monthly', 'yearly'] }).notNull(),
  amountCents:       integer('amount_cents').notNull(),
  currency:          text('currency').notNull().default('usd'),
  providerProductId: text('provider_product_id').notNull(),
  providerPriceId:   text('provider_price_id').notNull(),
  active:            integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt:         integer('created_at')
                       .notNull()
                       .default(sql`(unixepoch())`),
  updatedAt:         integer('updated_at', { mode: 'timestamp_ms' })
                       .notNull()
                       .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
                       .$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex('membership_plan_prices_plan_interval_provider_unique').on(t.planId, t.interval, t.provider),
  index('membership_plan_prices_creator_idx').on(t.creatorId),
  index('membership_plan_prices_provider_price_idx').on(t.provider, t.providerPriceId),
])

// ── Payment Customers ──────────────────────────────────────────────────────
export const paymentCustomers = sqliteTable('payment_customers', {
  userId:             text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider:           text('provider', { enum: ['stripe'] }).notNull(),
  providerCustomerId: text('provider_customer_id').notNull(),
  createdAt:          integer('created_at')
                        .notNull()
                        .default(sql`(unixepoch())`),
}, (t) => [
  primaryKey({ columns: [t.userId, t.provider] }),
  uniqueIndex('payment_customers_provider_customer_unique').on(t.provider, t.providerCustomerId),
])

// ── Subscription Memberships ───────────────────────────────────────────────
export const subscriptionMemberships = sqliteTable('subscription_memberships', {
  id:                        text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  creatorId:                 text('creator_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  subscriberId:              text('subscriber_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  planId:                    text('plan_id').references(() => membershipPlans.id, { onDelete: 'set null' }),
  provider:                  text('provider', { enum: ['internal', 'stripe'] }).notNull(),
  accessType:                text('access_type', { enum: ['free', 'trial', 'paid'] }).notNull(),
  interval:                  text('interval', { enum: ['monthly', 'yearly'] }),
  status:                    text('status', {
                              enum: ['pending', 'active', 'trialing', 'past_due', 'canceled', 'expired', 'incomplete'],
                            })
                              .notNull()
                              .default('active'),
  providerSubscriptionId:    text('provider_subscription_id'),
  providerCheckoutSessionId: text('provider_checkout_session_id'),
  providerCustomerId:        text('provider_customer_id'),
  currentPeriodStart:        integer('current_period_start'),
  currentPeriodEnd:          integer('current_period_end'),
  trialEndsAt:               integer('trial_ends_at'),
  cancelAt:                  integer('cancel_at'),
  canceledAt:                integer('canceled_at'),
  createdAt:                 integer('created_at')
                                .notNull()
                                .default(sql`(unixepoch())`),
  updatedAt:                 integer('updated_at', { mode: 'timestamp_ms' })
                                .notNull()
                                .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
                                .$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex('subscription_memberships_subscriber_creator_unique').on(t.subscriberId, t.creatorId),
  index('subscription_memberships_creator_idx').on(t.creatorId),
  index('subscription_memberships_subscriber_idx').on(t.subscriberId),
  index('subscription_memberships_provider_subscription_idx').on(t.provider, t.providerSubscriptionId),
  index('subscription_memberships_checkout_idx').on(t.providerCheckoutSessionId),
])

// ── Revenue Events ─────────────────────────────────────────────────────────
export const revenueEvents = sqliteTable('revenue_events', {
  id:                text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  creatorId:         text('creator_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  subscriberId:      text('subscriber_id').references(() => users.id, { onDelete: 'set null' }),
  membershipId:      text('membership_id').references(() => subscriptionMemberships.id, { onDelete: 'set null' }),
  provider:          text('provider', { enum: ['stripe'] }).notNull(),
  providerEventId:   text('provider_event_id'),
  providerInvoiceId: text('provider_invoice_id'),
  amountGrossCents:  integer('amount_gross_cents').notNull(),
  amountFeeCents:    integer('amount_fee_cents').notNull(),
  amountNetCents:    integer('amount_net_cents').notNull(),
  currency:          text('currency').notNull().default('usd'),
  occurredAt:        integer('occurred_at').notNull(),
  createdAt:         integer('created_at')
                       .notNull()
                       .default(sql`(unixepoch())`),
}, (t) => [
  index('revenue_events_creator_occurred_idx').on(t.creatorId, t.occurredAt),
  uniqueIndex('revenue_events_provider_invoice_unique').on(t.provider, t.providerInvoiceId),
])

// ── Payment Webhook Events ─────────────────────────────────────────────────
export const paymentWebhookEvents = sqliteTable('payment_webhook_events', {
  id:          text('id').primaryKey(),
  provider:    text('provider', { enum: ['stripe'] }).notNull(),
  eventType:   text('event_type').notNull(),
  processedAt: integer('processed_at')
                 .notNull()
                 .default(sql`(unixepoch())`),
})

// ── Notifications ─────────────────────────────────────────────────────────
export const notifications = sqliteTable('notifications', {
  id:           text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  recipientId:  text('recipient_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  actorId:      text('actor_id').references(() => users.id, { onDelete: 'set null' }),
  type:         text('type', {
                  enum: [
                    'content_published',
                    'reply_created',
                    'post_liked',
                    'subscription_started',
                    'subscription_active',
                    'subscription_status_changed',
                    'payment_failed',
                    'creator_application_approved',
                    'creator_application_rejected',
                    'content_hidden',
                    'content_restored',
                    'account_suspended',
                    'account_restored',
                  ],
                }).notNull(),
  category:     text('category', { enum: ['content', 'interaction', 'subscription', 'account'] }).notNull(),
  title:        text('title').notNull(),
  body:         text('body').notNull(),
  targetUrl:    text('target_url'),
  entityType:   text('entity_type'),
  entityId:     text('entity_id'),
  metadata:     text('metadata'),
  dedupeKey:    text('dedupe_key').notNull().unique(),
  readAt:       integer('read_at'),
  emailStatus:  text('email_status', { enum: ['not_applicable', 'pending', 'sent', 'failed'] })
                  .notNull()
                  .default('not_applicable'),
  emailError:   text('email_error'),
  emailSentAt:  integer('email_sent_at'),
  createdAt:    integer('created_at')
                  .notNull()
                  .default(sql`(unixepoch())`),
}, (t) => [
  index('notifications_recipient_read_created_idx').on(t.recipientId, t.readAt, t.createdAt),
  index('notifications_recipient_created_idx').on(t.recipientId, t.createdAt),
  index('notifications_actor_idx').on(t.actorId),
])

export const notificationPreferences = sqliteTable('notification_preferences', {
  userId:                   text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  emailEnabled:             integer('email_enabled', { mode: 'boolean' }).notNull().default(true),
  contentEmailEnabled:      integer('content_email_enabled', { mode: 'boolean' }).notNull().default(true),
  interactionEmailEnabled:  integer('interaction_email_enabled', { mode: 'boolean' }).notNull().default(false),
  subscriptionEmailEnabled: integer('subscription_email_enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt:                integer('created_at')
                              .notNull()
                              .default(sql`(unixepoch())`),
  updatedAt:                integer('updated_at', { mode: 'timestamp_ms' })
                              .notNull()
                              .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
                              .$onUpdate(() => new Date()),
})

// ── Inferred types ─────────────────────────────────────────────────────────
export type User                 = typeof users.$inferSelect
export type NewUser              = typeof users.$inferInsert
export type AdminMembership      = typeof adminMemberships.$inferSelect
export type CreatorProfileTab    = typeof creatorProfileTabs.$inferSelect
export type Session              = typeof session.$inferSelect
export type Account              = typeof account.$inferSelect
export type Verification         = typeof verification.$inferSelect
export type Post                 = typeof posts.$inferSelect
export type Article              = typeof articles.$inferSelect
export type AudioCollection      = typeof audioCollections.$inferSelect
export type AudioItem            = typeof audioItems.$inferSelect
export type PhotographyAlbum     = typeof photographyAlbums.$inferSelect
export type PhotographyPhoto     = typeof photographyPhotos.$inferSelect
export type PostAttachment       = typeof postAttachments.$inferSelect
export type PostReply            = typeof postReplies.$inferSelect
export type ReplyAttachment      = typeof replyAttachments.$inferSelect
export type PostLike             = typeof postLikes.$inferSelect
export type ReplyLike            = typeof replyLikes.$inferSelect
export type PostPoll             = typeof postPolls.$inferSelect
export type PollOption           = typeof pollOptions.$inferSelect
export type PollVote             = typeof pollVotes.$inferSelect
export type Follow               = typeof follows.$inferSelect
export type CreatorApplication   = typeof creatorApplications.$inferSelect
export type NewCreatorApplication = typeof creatorApplications.$inferInsert
export type ModerationCase       = typeof moderationCases.$inferSelect
export type ContentReport        = typeof contentReports.$inferSelect
export type AdminAuditLog        = typeof adminAuditLogs.$inferSelect
export type CreatorPaymentAccount = typeof creatorPaymentAccounts.$inferSelect
export type MembershipPlan        = typeof membershipPlans.$inferSelect
export type MembershipPlanPrice   = typeof membershipPlanPrices.$inferSelect
export type PaymentCustomer       = typeof paymentCustomers.$inferSelect
export type SubscriptionMembership = typeof subscriptionMemberships.$inferSelect
export type RevenueEvent          = typeof revenueEvents.$inferSelect
export type PaymentWebhookEvent   = typeof paymentWebhookEvents.$inferSelect
export type Notification          = typeof notifications.$inferSelect
export type NewNotification       = typeof notifications.$inferInsert
export type NotificationPreference = typeof notificationPreferences.$inferSelect
