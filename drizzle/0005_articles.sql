ALTER TABLE `posts` ADD COLUMN `kind` text DEFAULT 'post' NOT NULL;
--> statement-breakpoint
CREATE INDEX `posts_kind_created_idx` ON `posts` (`kind`,`created_at`);
--> statement-breakpoint
CREATE TABLE `articles` (
  `post_id` text PRIMARY KEY NOT NULL,
  `title` text NOT NULL,
  `excerpt` text,
  `markdown` text NOT NULL,
  `status` text DEFAULT 'draft' NOT NULL,
  `cover_r2_key` text,
  `cover_file_name` text,
  `cover_content_type` text,
  `cover_size_bytes` integer,
  `published_at` integer,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `articles_status_published_idx` ON `articles` (`status`,`published_at`);
