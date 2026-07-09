CREATE TABLE `courses` (
  `id` text PRIMARY KEY NOT NULL,
  `post_id` text NOT NULL,
  `creator_id` text NOT NULL,
  `slug` text NOT NULL,
  `title` text NOT NULL,
  `description` text,
  `status` text DEFAULT 'draft' NOT NULL,
  `published_at` integer,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `courses_post_unique` ON `courses` (`post_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `courses_creator_slug_unique` ON `courses` (`creator_id`,`slug`);
--> statement-breakpoint
CREATE INDEX `courses_creator_status_published_idx` ON `courses` (`creator_id`,`status`,`published_at`);
--> statement-breakpoint
CREATE TABLE `course_modules` (
  `id` text PRIMARY KEY NOT NULL,
  `course_id` text NOT NULL,
  `title` text NOT NULL,
  `description` text,
  `display_order` integer DEFAULT 0 NOT NULL,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `course_modules_course_order_idx` ON `course_modules` (`course_id`,`display_order`);
--> statement-breakpoint
CREATE TABLE `course_lessons` (
  `id` text PRIMARY KEY NOT NULL,
  `course_id` text NOT NULL,
  `module_id` text NOT NULL,
  `title` text NOT NULL,
  `summary` text,
  `markdown` text DEFAULT '' NOT NULL,
  `status` text DEFAULT 'draft' NOT NULL,
  `display_order` integer DEFAULT 0 NOT NULL,
  `published_at` integer,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`module_id`) REFERENCES `course_modules`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `course_lessons_module_order_idx` ON `course_lessons` (`module_id`,`display_order`);
--> statement-breakpoint
CREATE INDEX `course_lessons_course_status_idx` ON `course_lessons` (`course_id`,`status`,`published_at`);
--> statement-breakpoint
CREATE TABLE `course_attachments` (
  `id` text PRIMARY KEY NOT NULL,
  `course_id` text NOT NULL,
  `lesson_id` text NOT NULL,
  `uploader_id` text NOT NULL,
  `kind` text NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `r2_key` text NOT NULL,
  `r2_upload_id` text,
  `file_name` text NOT NULL,
  `content_type` text NOT NULL,
  `size_bytes` integer NOT NULL,
  `display_order` integer DEFAULT 0 NOT NULL,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`lesson_id`) REFERENCES `course_lessons`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`uploader_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `course_attachments_r2_key_unique` ON `course_attachments` (`r2_key`);
--> statement-breakpoint
CREATE INDEX `course_attachments_lesson_order_idx` ON `course_attachments` (`lesson_id`,`display_order`);
--> statement-breakpoint
CREATE INDEX `course_attachments_course_status_idx` ON `course_attachments` (`course_id`,`status`);
--> statement-breakpoint
CREATE TABLE `course_lesson_progress` (
  `course_id` text NOT NULL,
  `lesson_id` text NOT NULL,
  `user_id` text NOT NULL,
  `completed_at` integer DEFAULT (unixepoch()) NOT NULL,
  PRIMARY KEY (`lesson_id`,`user_id`),
  FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`lesson_id`) REFERENCES `course_lessons`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `course_progress_course_user_idx` ON `course_lesson_progress` (`course_id`,`user_id`);
