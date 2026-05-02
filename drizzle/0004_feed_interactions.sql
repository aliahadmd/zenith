ALTER TABLE `posts` ADD COLUMN `slug` text;
--> statement-breakpoint
UPDATE `posts`
SET `slug` = 'post-' || lower(substr(replace(`id`, '-', ''), 1, 12))
WHERE `slug` IS NULL OR `slug` = '';
--> statement-breakpoint
CREATE UNIQUE INDEX `posts_author_slug_unique` ON `posts` (`author_id`,`slug`);
--> statement-breakpoint
CREATE TABLE `post_attachments` (
  `id` text PRIMARY KEY NOT NULL,
  `post_id` text NOT NULL,
  `uploader_id` text NOT NULL,
  `r2_key` text NOT NULL,
  `file_name` text NOT NULL,
  `content_type` text NOT NULL,
  `size_bytes` integer NOT NULL,
  `display_order` integer DEFAULT 0 NOT NULL,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`uploader_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `post_attachments_r2_key_unique` ON `post_attachments` (`r2_key`);
--> statement-breakpoint
CREATE INDEX `post_attachments_post_idx` ON `post_attachments` (`post_id`,`display_order`);
--> statement-breakpoint
CREATE TABLE `post_replies` (
  `id` text PRIMARY KEY NOT NULL,
  `post_id` text NOT NULL,
  `author_id` text NOT NULL,
  `parent_reply_id` text,
  `mentioned_user_id` text,
  `body` text NOT NULL,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`parent_reply_id`) REFERENCES `post_replies`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`mentioned_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `post_replies_post_created_idx` ON `post_replies` (`post_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `post_replies_parent_idx` ON `post_replies` (`parent_reply_id`);
--> statement-breakpoint
CREATE TABLE `reply_attachments` (
  `id` text PRIMARY KEY NOT NULL,
  `reply_id` text NOT NULL,
  `uploader_id` text NOT NULL,
  `r2_key` text NOT NULL,
  `file_name` text NOT NULL,
  `content_type` text NOT NULL,
  `size_bytes` integer NOT NULL,
  `display_order` integer DEFAULT 0 NOT NULL,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  FOREIGN KEY (`reply_id`) REFERENCES `post_replies`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`uploader_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reply_attachments_r2_key_unique` ON `reply_attachments` (`r2_key`);
--> statement-breakpoint
CREATE INDEX `reply_attachments_reply_idx` ON `reply_attachments` (`reply_id`,`display_order`);
--> statement-breakpoint
CREATE TABLE `post_likes` (
  `post_id` text NOT NULL,
  `user_id` text NOT NULL,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  PRIMARY KEY(`post_id`, `user_id`),
  FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `post_likes_user_idx` ON `post_likes` (`user_id`);
--> statement-breakpoint
CREATE TABLE `reply_likes` (
  `reply_id` text NOT NULL,
  `user_id` text NOT NULL,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  PRIMARY KEY(`reply_id`, `user_id`),
  FOREIGN KEY (`reply_id`) REFERENCES `post_replies`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reply_likes_user_idx` ON `reply_likes` (`user_id`);
--> statement-breakpoint
CREATE TABLE `post_polls` (
  `id` text PRIMARY KEY NOT NULL,
  `post_id` text NOT NULL,
  `question` text NOT NULL,
  `closes_at` integer,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `post_polls_post_id_unique` ON `post_polls` (`post_id`);
--> statement-breakpoint
CREATE INDEX `post_polls_post_idx` ON `post_polls` (`post_id`);
--> statement-breakpoint
CREATE TABLE `poll_options` (
  `id` text PRIMARY KEY NOT NULL,
  `poll_id` text NOT NULL,
  `text` text NOT NULL,
  `position` integer NOT NULL,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  FOREIGN KEY (`poll_id`) REFERENCES `post_polls`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `poll_options_poll_position_idx` ON `poll_options` (`poll_id`,`position`);
--> statement-breakpoint
CREATE TABLE `poll_votes` (
  `poll_id` text NOT NULL,
  `user_id` text NOT NULL,
  `option_id` text NOT NULL,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  PRIMARY KEY(`poll_id`, `user_id`),
  FOREIGN KEY (`poll_id`) REFERENCES `post_polls`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`option_id`) REFERENCES `poll_options`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `poll_votes_option_idx` ON `poll_votes` (`option_id`);
