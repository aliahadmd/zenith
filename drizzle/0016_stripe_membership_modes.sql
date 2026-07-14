ALTER TABLE `membership_plans` ADD `mode` text DEFAULT 'disabled' NOT NULL CHECK (`mode` IN ('disabled', 'free_permanent', 'free_trial', 'paid'));
--> statement-breakpoint
ALTER TABLE `membership_plans` ADD `provider_product_id` text;
--> statement-breakpoint
ALTER TABLE `membership_plans` ADD `revision` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE `membership_plans`
SET `mode` = CASE
  WHEN `paid_enabled` = 1 THEN 'paid'
  WHEN `free_trial_enabled` = 1 THEN 'free_trial'
  WHEN `free_permanent_enabled` = 1 THEN 'free_permanent'
  ELSE 'disabled'
END;
--> statement-breakpoint
ALTER TABLE `creator_payment_accounts` ADD `transfers_enabled` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE `creator_payment_accounts` SET `transfers_enabled` = `charges_enabled`;
--> statement-breakpoint
DROP INDEX `membership_plan_prices_plan_interval_provider_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `membership_plan_prices_active_interval_unique`
ON `membership_plan_prices` (`plan_id`, `interval`, `provider`) WHERE `active` = 1;
--> statement-breakpoint
CREATE UNIQUE INDEX `membership_plan_prices_provider_price_unique`
ON `membership_plan_prices` (`provider`, `provider_price_id`);
--> statement-breakpoint
ALTER TABLE `subscription_memberships` ADD `plan_price_id` text REFERENCES `membership_plan_prices`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `subscription_memberships` ADD `provider_event_created_at` integer;
--> statement-breakpoint
CREATE INDEX `subscription_memberships_plan_price_idx` ON `subscription_memberships` (`plan_price_id`);
--> statement-breakpoint
CREATE TABLE `membership_trial_claims` (
  `creator_id` text NOT NULL,
  `subscriber_id` text NOT NULL,
  `plan_id` text,
  `started_at` integer NOT NULL,
  `ends_at` integer NOT NULL,
  PRIMARY KEY (`creator_id`, `subscriber_id`),
  FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON DELETE cascade,
  FOREIGN KEY (`subscriber_id`) REFERENCES `users`(`id`) ON DELETE cascade,
  FOREIGN KEY (`plan_id`) REFERENCES `membership_plans`(`id`) ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `membership_trial_claims_ends_idx` ON `membership_trial_claims` (`ends_at`);
--> statement-breakpoint
INSERT OR IGNORE INTO `membership_trial_claims` (`creator_id`, `subscriber_id`, `plan_id`, `started_at`, `ends_at`)
SELECT `creator_id`, `subscriber_id`, `plan_id`, `created_at`, `trial_ends_at`
FROM `subscription_memberships`
WHERE `access_type` = 'trial' AND `trial_ends_at` IS NOT NULL;
--> statement-breakpoint
CREATE TABLE `membership_plan_transitions` (
  `id` text PRIMARY KEY NOT NULL,
  `plan_id` text NOT NULL,
  `membership_id` text NOT NULL,
  `provider_subscription_id` text NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL CHECK (`status` IN ('pending', 'processing', 'completed', 'failed')),
  `attempts` integer DEFAULT 0 NOT NULL,
  `next_attempt_at` integer DEFAULT (unixepoch()) NOT NULL,
  `claimed_at` integer,
  `last_error` text,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch()) NOT NULL,
  FOREIGN KEY (`plan_id`) REFERENCES `membership_plans`(`id`) ON DELETE cascade,
  FOREIGN KEY (`membership_id`) REFERENCES `subscription_memberships`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `membership_plan_transitions_membership_unique` ON `membership_plan_transitions` (`membership_id`);
--> statement-breakpoint
CREATE INDEX `membership_plan_transitions_due_idx` ON `membership_plan_transitions` (`status`, `next_attempt_at`);
--> statement-breakpoint
ALTER TABLE `payment_webhook_events` ADD `livemode` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `payment_webhook_events` ADD `status` text DEFAULT 'completed' NOT NULL CHECK (`status` IN ('processing', 'completed', 'failed'));
--> statement-breakpoint
ALTER TABLE `payment_webhook_events` ADD `event_created_at` integer;
--> statement-breakpoint
ALTER TABLE `payment_webhook_events` ADD `attempts` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `payment_webhook_events` ADD `claimed_at` integer;
--> statement-breakpoint
ALTER TABLE `payment_webhook_events` ADD `last_error` text;
--> statement-breakpoint
CREATE INDEX `payment_webhook_events_status_claimed_idx` ON `payment_webhook_events` (`status`, `claimed_at`);
