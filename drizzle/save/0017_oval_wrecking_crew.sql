CREATE TABLE `coach_seasons` (
	`id` text PRIMARY KEY NOT NULL,
	`coach_id` text NOT NULL,
	`team_id` text NOT NULL,
	`season_number` integer NOT NULL,
	`competition_id` text NOT NULL,
	`start_date` integer NOT NULL,
	`end_date` integer,
	`end_reason` text,
	`closed` integer DEFAULT false NOT NULL,
	`games` integer DEFAULT 0 NOT NULL,
	`wins` integer DEFAULT 0 NOT NULL,
	`position` integer,
	`teams` integer DEFAULT 0 NOT NULL,
	`tier` integer DEFAULT 1 NOT NULL,
	`club_reputation` integer DEFAULT 50 NOT NULL,
	`titles` integer DEFAULT 0 NOT NULL,
	`title_names` text DEFAULT '[]' NOT NULL,
	`points` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`coach_id`) REFERENCES `coaches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`competition_id`) REFERENCES `competitions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_coach_seasons_coach` ON `coach_seasons` (`coach_id`);--> statement-breakpoint
CREATE INDEX `idx_coach_seasons_season` ON `coach_seasons` (`season_number`);--> statement-breakpoint
CREATE TABLE `coaches` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`nationality` text DEFAULT 'ESP' NOT NULL,
	`birth_date` integer,
	`base_reputation` integer DEFAULT 35 NOT NULL,
	`retired` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_coaches_team` ON `coaches` (`team_id`);