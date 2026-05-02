CREATE TABLE `creator_payment_accounts` (
  `creator_id` text PRIMARY KEY NOT NULL,
  `provider` text NOT NULL,
  `provider_account_id` text NOT NULL,
  `status` text DEFAULT 'onboarding' NOT NULL,
  `charges_enabled` integer DEFAULT 0 NOT NULL,
  `payouts_enabled` integer DEFAULT 0 NOT NULL,
  `details_submitted` integer DEFAULT 0 NOT NULL,
  `requirements_due` text,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `creator_payment_accounts_provider_account_id_unique` ON `creator_payment_accounts` (`provider_account_id`);
--> statement-breakpoint
CREATE INDEX `creator_payment_accounts_provider_idx` ON `creator_payment_accounts` (`provider`,`provider_account_id`);
--> statement-breakpoint
CREATE TABLE `membership_plans` (
  `id` text PRIMARY KEY NOT NULL,
  `creator_id` text NOT NULL,
  `name` text DEFAULT 'Membership' NOT NULL,
  `description` text,
  `currency` text DEFAULT 'usd' NOT NULL,
  `paid_enabled` integer DEFAULT 0 NOT NULL,
  `free_permanent_enabled` integer DEFAULT 0 NOT NULL,
  `free_trial_enabled` integer DEFAULT 0 NOT NULL,
  `free_trial_days` integer,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `membership_plans_creator_id_unique` ON `membership_plans` (`creator_id`);
--> statement-breakpoint
CREATE INDEX `membership_plans_creator_idx` ON `membership_plans` (`creator_id`);
--> statement-breakpoint
CREATE TABLE `membership_plan_prices` (
  `id` text PRIMARY KEY NOT NULL,
  `plan_id` text NOT NULL,
  `creator_id` text NOT NULL,
  `provider` text NOT NULL,
  `interval` text NOT NULL,
  `amount_cents` integer NOT NULL,
  `currency` text DEFAULT 'usd' NOT NULL,
  `provider_product_id` text NOT NULL,
  `provider_price_id` text NOT NULL,
  `active` integer DEFAULT 1 NOT NULL,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  FOREIGN KEY (`plan_id`) REFERENCES `membership_plans`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `membership_plan_prices_plan_interval_provider_unique` ON `membership_plan_prices` (`plan_id`,`interval`,`provider`);
--> statement-breakpoint
CREATE INDEX `membership_plan_prices_creator_idx` ON `membership_plan_prices` (`creator_id`);
--> statement-breakpoint
CREATE INDEX `membership_plan_prices_provider_price_idx` ON `membership_plan_prices` (`provider`,`provider_price_id`);
--> statement-breakpoint
CREATE TABLE `payment_customers` (
  `user_id` text NOT NULL,
  `provider` text NOT NULL,
  `provider_customer_id` text NOT NULL,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  PRIMARY KEY(`user_id`, `provider`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_customers_provider_customer_unique` ON `payment_customers` (`provider`,`provider_customer_id`);
--> statement-breakpoint
CREATE TABLE `subscription_memberships` (
  `id` text PRIMARY KEY NOT NULL,
  `creator_id` text NOT NULL,
  `subscriber_id` text NOT NULL,
  `plan_id` text,
  `provider` text NOT NULL,
  `access_type` text NOT NULL,
  `interval` text,
  `status` text DEFAULT 'active' NOT NULL,
  `provider_subscription_id` text,
  `provider_checkout_session_id` text,
  `provider_customer_id` text,
  `current_period_start` integer,
  `current_period_end` integer,
  `trial_ends_at` integer,
  `cancel_at` integer,
  `canceled_at` integer,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`subscriber_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`plan_id`) REFERENCES `membership_plans`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_memberships_subscriber_creator_unique` ON `subscription_memberships` (`subscriber_id`,`creator_id`);
--> statement-breakpoint
CREATE INDEX `subscription_memberships_creator_idx` ON `subscription_memberships` (`creator_id`);
--> statement-breakpoint
CREATE INDEX `subscription_memberships_subscriber_idx` ON `subscription_memberships` (`subscriber_id`);
--> statement-breakpoint
CREATE INDEX `subscription_memberships_provider_subscription_idx` ON `subscription_memberships` (`provider`,`provider_subscription_id`);
--> statement-breakpoint
CREATE INDEX `subscription_memberships_checkout_idx` ON `subscription_memberships` (`provider_checkout_session_id`);
--> statement-breakpoint
CREATE TABLE `revenue_events` (
  `id` text PRIMARY KEY NOT NULL,
  `creator_id` text NOT NULL,
  `subscriber_id` text,
  `membership_id` text,
  `provider` text NOT NULL,
  `provider_event_id` text,
  `provider_invoice_id` text,
  `amount_gross_cents` integer NOT NULL,
  `amount_fee_cents` integer NOT NULL,
  `amount_net_cents` integer NOT NULL,
  `currency` text DEFAULT 'usd' NOT NULL,
  `occurred_at` integer NOT NULL,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`subscriber_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`membership_id`) REFERENCES `subscription_memberships`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `revenue_events_creator_occurred_idx` ON `revenue_events` (`creator_id`,`occurred_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `revenue_events_provider_invoice_unique` ON `revenue_events` (`provider`,`provider_invoice_id`);
--> statement-breakpoint
CREATE TABLE `payment_webhook_events` (
  `id` text PRIMARY KEY NOT NULL,
  `provider` text NOT NULL,
  `event_type` text NOT NULL,
  `processed_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
INSERT INTO `membership_plans` (
  `id`,
  `creator_id`,
  `name`,
  `free_permanent_enabled`,
  `created_at`,
  `updated_at`
)
SELECT
  'plan_' || lower(hex(randomblob(16))),
  `users`.`id`,
  'Membership',
  1,
  unixepoch(),
  cast(unixepoch('subsecond') * 1000 as integer)
FROM `users`
WHERE `users`.`role` = 'creator'
  AND NOT EXISTS (
    SELECT 1 FROM `membership_plans` WHERE `membership_plans`.`creator_id` = `users`.`id`
  );
--> statement-breakpoint
INSERT INTO `subscription_memberships` (
  `id`,
  `creator_id`,
  `subscriber_id`,
  `plan_id`,
  `provider`,
  `access_type`,
  `status`,
  `created_at`,
  `updated_at`
)
SELECT
  'mem_' || lower(hex(randomblob(16))),
  `follows`.`followee_id`,
  `follows`.`follower_id`,
  `membership_plans`.`id`,
  'internal',
  'free',
  'active',
  `follows`.`created_at`,
  `follows`.`created_at` * 1000
FROM `follows`
INNER JOIN `membership_plans` ON `membership_plans`.`creator_id` = `follows`.`followee_id`
WHERE NOT EXISTS (
  SELECT 1
  FROM `subscription_memberships`
  WHERE `subscription_memberships`.`subscriber_id` = `follows`.`follower_id`
    AND `subscription_memberships`.`creator_id` = `follows`.`followee_id`
);
