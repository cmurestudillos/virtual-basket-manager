CREATE TABLE `celebrations` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`trophy_kind` text NOT NULL,
	`season_id` text NOT NULL,
	`competition_id` text NOT NULL,
	`team_id` text NOT NULL,
	`team_name` text NOT NULL,
	`competition_name` text NOT NULL,
	`happened_on` integer NOT NULL,
	`created_at` integer NOT NULL,
	`seen_on` integer,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `celebrations_season_kind_idx` ON `celebrations` (`season_id`,`kind`);--> statement-breakpoint
CREATE INDEX `celebrations_seen_on_idx` ON `celebrations` (`seen_on`);--> statement-breakpoint
CREATE TABLE `season_awards` (
	`id` text PRIMARY KEY NOT NULL,
	`season_id` text NOT NULL,
	`competition_id` text NOT NULL,
	`type` text NOT NULL,
	`player_id` text,
	`player_name` text,
	`coach_id` text,
	`coach_name` text,
	`nationality` text,
	`team_id` text NOT NULL,
	`team_name` text NOT NULL,
	`value` real NOT NULL,
	`slot` integer DEFAULT 0 NOT NULL,
	`position` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `season_awards_unique_idx` ON `season_awards` (`season_id`,`type`,`slot`);