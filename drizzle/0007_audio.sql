CREATE TABLE `audio_collections` (
  `id` text PRIMARY KEY NOT NULL,
  `creator_id` text NOT NULL,
  `kind` text NOT NULL,
  `slug` text NOT NULL,
  `title` text NOT NULL,
  `description` text,
  `status` text DEFAULT 'draft' NOT NULL,
  `cover_r2_key` text,
  `cover_file_name` text,
  `cover_content_type` text,
  `cover_size_bytes` integer,
  `release_date` integer,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `audio_collections_creator_slug_unique` ON `audio_collections` (`creator_id`,`slug`);
--> statement-breakpoint
CREATE INDEX `audio_collections_creator_kind_idx` ON `audio_collections` (`creator_id`,`kind`,`status`);
--> statement-breakpoint
CREATE TABLE `audio_items` (
  `id` text PRIMARY KEY NOT NULL,
  `collection_id` text NOT NULL,
  `post_id` text NOT NULL,
  `creator_id` text NOT NULL,
  `kind` text NOT NULL,
  `slug` text NOT NULL,
  `title` text NOT NULL,
  `description` text,
  `status` text DEFAULT 'draft' NOT NULL,
  `audio_r2_key` text,
  `audio_file_name` text,
  `audio_content_type` text,
  `audio_size_bytes` integer,
  `cover_r2_key` text,
  `cover_file_name` text,
  `cover_content_type` text,
  `cover_size_bytes` integer,
  `duration_seconds` integer,
  `display_order` integer DEFAULT 0 NOT NULL,
  `published_at` integer,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  FOREIGN KEY (`collection_id`) REFERENCES `audio_collections`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `audio_items_post_unique` ON `audio_items` (`post_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `audio_items_creator_slug_unique` ON `audio_items` (`creator_id`,`slug`);
--> statement-breakpoint
CREATE INDEX `audio_items_collection_order_idx` ON `audio_items` (`collection_id`,`display_order`);
--> statement-breakpoint
CREATE INDEX `audio_items_creator_published_idx` ON `audio_items` (`creator_id`,`status`,`published_at`);
