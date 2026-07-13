ALTER TABLE `posts` ADD `published_at` integer;
--> statement-breakpoint
UPDATE `posts`
SET `published_at` = CASE `kind`
  WHEN 'post' THEN `created_at`
  WHEN 'article' THEN COALESCE(
    (SELECT `published_at` FROM `articles` WHERE `articles`.`post_id` = `posts`.`id` AND `articles`.`status` = 'published'),
    CASE WHEN EXISTS (SELECT 1 FROM `articles` WHERE `articles`.`post_id` = `posts`.`id` AND `articles`.`status` = 'published') THEN `created_at` END
  )
  WHEN 'audio' THEN COALESCE(
    (SELECT `published_at` FROM `audio_items` WHERE `audio_items`.`post_id` = `posts`.`id` AND `audio_items`.`status` = 'published'),
    CASE WHEN EXISTS (SELECT 1 FROM `audio_items` WHERE `audio_items`.`post_id` = `posts`.`id` AND `audio_items`.`status` = 'published') THEN `created_at` END
  )
  WHEN 'photography' THEN COALESCE(
    (SELECT `published_at` FROM `photography_albums` WHERE `photography_albums`.`post_id` = `posts`.`id` AND `photography_albums`.`status` = 'published'),
    CASE WHEN EXISTS (SELECT 1 FROM `photography_albums` WHERE `photography_albums`.`post_id` = `posts`.`id` AND `photography_albums`.`status` = 'published') THEN `created_at` END
  )
  WHEN 'course' THEN COALESCE(
    (SELECT `published_at` FROM `courses` WHERE `courses`.`post_id` = `posts`.`id` AND `courses`.`status` = 'published'),
    CASE WHEN EXISTS (SELECT 1 FROM `courses` WHERE `courses`.`post_id` = `posts`.`id` AND `courses`.`status` = 'published') THEN `created_at` END
  )
END;
--> statement-breakpoint
CREATE INDEX `posts_kind_published_idx` ON `posts` (`kind`,`published_at`);
--> statement-breakpoint
CREATE TABLE `content_schedules` (
  `post_id` text PRIMARY KEY NOT NULL,
  `creator_id` text NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `scheduled_for` integer NOT NULL,
  `next_attempt_at` integer NOT NULL,
  `attempt_count` integer DEFAULT 0 NOT NULL,
  `revision` integer DEFAULT 1 NOT NULL,
  `processing_started_at` integer,
  `last_error_code` text,
  `last_error_message` text,
  `published_at` integer,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch()) NOT NULL,
  FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `content_schedules_due_idx` ON `content_schedules` (`status`,`next_attempt_at`);
--> statement-breakpoint
CREATE INDEX `content_schedules_creator_status_idx` ON `content_schedules` (`creator_id`,`status`,`scheduled_for`);
