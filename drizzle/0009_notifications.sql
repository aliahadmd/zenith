CREATE TABLE `notifications` (
  `id` text PRIMARY KEY NOT NULL,
  `recipient_id` text NOT NULL,
  `actor_id` text,
  `type` text NOT NULL,
  `category` text NOT NULL,
  `title` text NOT NULL,
  `body` text NOT NULL,
  `target_url` text,
  `entity_type` text,
  `entity_id` text,
  `metadata` text,
  `dedupe_key` text NOT NULL,
  `read_at` integer,
  `email_status` text DEFAULT 'not_applicable' NOT NULL,
  `email_error` text,
  `email_sent_at` integer,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  FOREIGN KEY (`recipient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_dedupe_key_unique` ON `notifications` (`dedupe_key`);
--> statement-breakpoint
CREATE INDEX `notifications_recipient_read_created_idx` ON `notifications` (`recipient_id`,`read_at`,`created_at`);
--> statement-breakpoint
CREATE INDEX `notifications_recipient_created_idx` ON `notifications` (`recipient_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `notifications_actor_idx` ON `notifications` (`actor_id`);
--> statement-breakpoint
CREATE TABLE `notification_preferences` (
  `user_id` text PRIMARY KEY NOT NULL,
  `email_enabled` integer DEFAULT true NOT NULL,
  `content_email_enabled` integer DEFAULT true NOT NULL,
  `interaction_email_enabled` integer DEFAULT false NOT NULL,
  `subscription_email_enabled` integer DEFAULT true NOT NULL,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
