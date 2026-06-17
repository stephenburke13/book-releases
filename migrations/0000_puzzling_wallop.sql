CREATE TABLE `author_search_cache` (
	`query` text PRIMARY KEY NOT NULL,
	`results` text NOT NULL,
	`fetched_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`author_key` text NOT NULL,
	`type` text NOT NULL,
	`author` text NOT NULL,
	`title` text NOT NULL,
	`release_date` text NOT NULL,
	`date_precision` text NOT NULL,
	`formats` text DEFAULT '[]' NOT NULL,
	`previous_release_date` text,
	`detected_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_author_detected` ON `events` (`author_key`,`detected_at`);--> statement-breakpoint
CREATE TABLE `subscribers` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`confirmed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscribers_email_unique` ON `subscribers` (`email`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`subscriber_id` text NOT NULL,
	`author_key` text NOT NULL,
	`cadence` text DEFAULT 'weekly' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_digest_at` integer,
	FOREIGN KEY (`subscriber_id`) REFERENCES `subscribers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_key`) REFERENCES `tracked_authors`(`author_key`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_sub_author` ON `subscriptions` (`subscriber_id`,`author_key`);--> statement-breakpoint
CREATE TABLE `tracked_authors` (
	`author_key` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`hardcover_id` integer,
	`google_query` text,
	`primary_author_names` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tracker_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
