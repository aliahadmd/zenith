CREATE TABLE `saved_items` (
  `user_id` text NOT NULL,
  `post_id` text NOT NULL,
  `saved_at` integer DEFAULT (unixepoch()) NOT NULL,
  PRIMARY KEY (`user_id`, `post_id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `saved_items_user_saved_idx` ON `saved_items` (`user_id`,`saved_at`);
