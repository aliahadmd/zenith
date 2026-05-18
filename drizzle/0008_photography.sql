CREATE TABLE `photography_albums` (
  `id` text PRIMARY KEY NOT NULL,
  `post_id` text NOT NULL,
  `creator_id` text NOT NULL,
  `slug` text NOT NULL,
  `title` text NOT NULL,
  `description` text,
  `status` text DEFAULT 'draft' NOT NULL,
  `downloads_enabled` integer DEFAULT false NOT NULL,
  `shoot_date` integer,
  `cover_photo_id` text,
  `published_at` integer,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `photography_albums_post_unique` ON `photography_albums` (`post_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `photography_albums_creator_slug_unique` ON `photography_albums` (`creator_id`,`slug`);
--> statement-breakpoint
CREATE INDEX `photography_albums_creator_published_idx` ON `photography_albums` (`creator_id`,`status`,`published_at`);
--> statement-breakpoint
CREATE TABLE `photography_photos` (
  `id` text PRIMARY KEY NOT NULL,
  `album_id` text NOT NULL,
  `creator_id` text NOT NULL,
  `title` text,
  `caption` text,
  `alt_text` text,
  `status` text DEFAULT 'published' NOT NULL,
  `preview_r2_key` text NOT NULL,
  `preview_file_name` text NOT NULL,
  `preview_content_type` text NOT NULL,
  `preview_size_bytes` integer NOT NULL,
  `original_r2_key` text,
  `original_file_name` text,
  `original_content_type` text,
  `original_size_bytes` integer,
  `original_download_enabled` integer DEFAULT false NOT NULL,
  `width` integer,
  `height` integer,
  `display_order` integer DEFAULT 0 NOT NULL,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  FOREIGN KEY (`album_id`) REFERENCES `photography_albums`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `photography_photos_album_order_idx` ON `photography_photos` (`album_id`,`display_order`);
--> statement-breakpoint
CREATE INDEX `photography_photos_creator_status_idx` ON `photography_photos` (`creator_id`,`status`,`created_at`);
