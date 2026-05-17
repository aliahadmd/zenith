CREATE TABLE `creator_profile_tabs` (
  `creator_id` text NOT NULL,
  `tab_key` text NOT NULL,
  `visible` integer DEFAULT true NOT NULL,
  `display_order` integer NOT NULL,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  PRIMARY KEY(`creator_id`, `tab_key`),
  FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `creator_profile_tabs_creator_order_idx` ON `creator_profile_tabs` (`creator_id`,`display_order`);
