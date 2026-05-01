CREATE TABLE `creator_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`full_name` text NOT NULL,
	`address` text NOT NULL,
	`city` text NOT NULL,
	`country` text NOT NULL,
	`nid_number` text NOT NULL,
	`nid_document_r2_key` text NOT NULL,
	`social_links` text NOT NULL,
	`content_links` text NOT NULL,
	`status` text DEFAULT 'approved' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `creator_applications_user_id_unique` ON `creator_applications` (`user_id`);
