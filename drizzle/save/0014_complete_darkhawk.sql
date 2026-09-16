CREATE TABLE `national_callups` (
	`id` text PRIMARY KEY NOT NULL,
	`national_team_id` text NOT NULL,
	`player_id` text NOT NULL,
	`season_number` integer NOT NULL,
	`window` text NOT NULL,
	FOREIGN KEY (`national_team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_national_callups_window` ON `national_callups` (`season_number`,`window`);--> statement-breakpoint
CREATE INDEX `idx_national_callups_player` ON `national_callups` (`player_id`);--> statement-breakpoint
CREATE TABLE `national_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`season_id` text NOT NULL,
	`group_name` text NOT NULL,
	`team_id` text NOT NULL,
	`pot` integer NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_national_groups_season` ON `national_groups` (`season_id`);--> statement-breakpoint
CREATE TABLE `national_spells` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`start_season` integer NOT NULL,
	`end_season` integer,
	`end_reason` text,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `teams` ADD `national_of` text;