ALTER TABLE `post_replies` ADD `edited_at` integer;
--> statement-breakpoint
ALTER TABLE `post_replies` ADD `deleted_at` integer;
--> statement-breakpoint
CREATE INDEX `post_replies_post_deleted_created_idx` ON `post_replies` (`post_id`,`deleted_at`,`created_at`);
