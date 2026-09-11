CREATE TABLE `finance_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`season_id` text,
	`happened_on` integer NOT NULL,
	`type` text NOT NULL,
	`description` text NOT NULL,
	`amount_cents` integer NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_finance_entries_team` ON `finance_entries` (`team_id`,`happened_on`);--> statement-breakpoint
CREATE TABLE `board` (
	`team_id` text PRIMARY KEY NOT NULL,
	`season_number` integer DEFAULT 1 NOT NULL,
	`objective` text DEFAULT 'midtable' NOT NULL,
	`target_position` integer DEFAULT 9 NOT NULL,
	`confidence` integer DEFAULT 60 NOT NULL,
	`dismissed` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `teams` ADD `ticket_price_cents` integer DEFAULT 2000 NOT NULL;--> statement-breakpoint
ALTER TABLE `teams` ADD `season_ticket_holders` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `teams` ADD `fan_support` integer DEFAULT 55 NOT NULL;