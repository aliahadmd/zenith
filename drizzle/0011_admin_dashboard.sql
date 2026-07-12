ALTER TABLE `users` ADD `account_status` text DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD `suspension_reason` text;
--> statement-breakpoint
ALTER TABLE `users` ADD `suspended_at` integer;
--> statement-breakpoint
ALTER TABLE `users` ADD `suspended_by` text REFERENCES `users`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `posts` ADD `moderation_status` text DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE `posts` ADD `moderation_reason` text;
--> statement-breakpoint
ALTER TABLE `posts` ADD `moderated_at` integer;
--> statement-breakpoint
ALTER TABLE `posts` ADD `moderated_by` text REFERENCES `users`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `post_replies` ADD `moderation_status` text DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE `post_replies` ADD `moderation_reason` text;
--> statement-breakpoint
ALTER TABLE `post_replies` ADD `moderated_at` integer;
--> statement-breakpoint
ALTER TABLE `post_replies` ADD `moderated_by` text REFERENCES `users`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
CREATE TABLE `admin_memberships` (
	`user_id` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`granted_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`granted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `admin_memberships_role_idx` ON `admin_memberships` (`role`);
--> statement-breakpoint
CREATE TABLE `moderation_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`assigned_admin_id` text,
	`resolution_action` text,
	`resolution_note` text,
	`resolved_by` text,
	`resolved_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`assigned_admin_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`resolved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `moderation_cases_target_unique` ON `moderation_cases` (`target_type`,`target_id`);
--> statement-breakpoint
CREATE INDEX `moderation_cases_status_updated_idx` ON `moderation_cases` (`status`,`updated_at`);
--> statement-breakpoint
CREATE TABLE `content_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`reporter_id` text NOT NULL,
	`reason` text NOT NULL,
	`details` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `moderation_cases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_reports_case_reporter_unique` ON `content_reports` (`case_id`,`reporter_id`);
--> statement-breakpoint
CREATE INDEX `content_reports_case_created_idx` ON `content_reports` (`case_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `admin_audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`reason` text,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `admin_audit_logs_created_idx` ON `admin_audit_logs` (`created_at`);
--> statement-breakpoint
CREATE INDEX `admin_audit_logs_actor_created_idx` ON `admin_audit_logs` (`actor_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `creator_applications_new` (
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
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewed_by` text,
	`reviewed_at` integer,
	`decision_reason` text,
	`admin_note` text,
	`resubmitted_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `creator_applications_new` (
	`id`, `user_id`, `full_name`, `address`, `city`, `country`, `nid_number`,
	`nid_document_r2_key`, `social_links`, `content_links`, `status`, `created_at`, `updated_at`
)
SELECT
	`id`, `user_id`, `full_name`, `address`, `city`, `country`, `nid_number`,
	`nid_document_r2_key`, `social_links`, `content_links`, `status`, `created_at`, `created_at`
FROM `creator_applications`;
--> statement-breakpoint
DROP TABLE `creator_applications`;
--> statement-breakpoint
ALTER TABLE `creator_applications_new` RENAME TO `creator_applications`;
--> statement-breakpoint
CREATE UNIQUE INDEX `creator_applications_user_id_unique` ON `creator_applications` (`user_id`);
--> statement-breakpoint
CREATE INDEX `creator_applications_status_updated_idx` ON `creator_applications` (`status`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `users_account_status_idx` ON `users` (`account_status`);
--> statement-breakpoint
CREATE INDEX `posts_moderation_author_idx` ON `posts` (`moderation_status`,`author_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `post_replies_moderation_post_idx` ON `post_replies` (`moderation_status`,`post_id`,`created_at`);
