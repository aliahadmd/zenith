CREATE TABLE `discovery_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`display_order` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `discovery_categories_slug_unique` ON `discovery_categories` (`slug`);
--> statement-breakpoint
CREATE UNIQUE INDEX `discovery_categories_name_unique` ON `discovery_categories` (lower(`name`));
--> statement-breakpoint
CREATE INDEX `discovery_categories_active_order_idx` ON `discovery_categories` (`active`,`display_order`);
--> statement-breakpoint
CREATE TABLE `creator_categories` (
	`creator_id` text NOT NULL,
	`category_id` text NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`creator_id`, `category_id`),
	FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `discovery_categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `creator_categories_category_creator_idx` ON `creator_categories` (`category_id`,`creator_id`);
--> statement-breakpoint
CREATE INDEX `creator_categories_creator_order_idx` ON `creator_categories` (`creator_id`,`display_order`);
--> statement-breakpoint
CREATE TABLE `user_category_interests` (
	`user_id` text NOT NULL,
	`category_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`user_id`, `category_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `discovery_categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_category_interests_category_user_idx` ON `user_category_interests` (`category_id`,`user_id`);
--> statement-breakpoint
CREATE TABLE `featured_creators` (
	`creator_id` text PRIMARY KEY NOT NULL,
	`display_order` integer NOT NULL,
	`featured_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`featured_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `featured_creators_order_idx` ON `featured_creators` (`display_order`);
--> statement-breakpoint
INSERT INTO `discovery_categories` (`id`, `slug`, `name`, `display_order`) VALUES
	('cat-art-design', 'art-design', 'Art & Design', 0),
	('cat-business', 'business', 'Business', 1),
	('cat-education', 'education', 'Education', 2),
	('cat-entertainment', 'entertainment', 'Entertainment', 3),
	('cat-fashion-beauty', 'fashion-beauty', 'Fashion & Beauty', 4),
	('cat-food-drink', 'food-drink', 'Food & Drink', 5),
	('cat-gaming', 'gaming', 'Gaming', 6),
	('cat-health-wellness', 'health-wellness', 'Health & Wellness', 7),
	('cat-music-audio', 'music-audio', 'Music & Audio', 8),
	('cat-photography', 'photography', 'Photography', 9),
	('cat-science-technology', 'science-technology', 'Science & Technology', 10),
	('cat-sports', 'sports', 'Sports', 11),
	('cat-travel', 'travel', 'Travel', 12),
	('cat-writing-journalism', 'writing-journalism', 'Writing & Journalism', 13);
