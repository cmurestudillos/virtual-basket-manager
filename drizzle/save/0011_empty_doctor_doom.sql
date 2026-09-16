CREATE TABLE `career_spells` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`start_season` integer NOT NULL,
	`end_season` integer,
	`end_reason` text,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_career_spells_team` ON `career_spells` (`team_id`);--> statement-breakpoint
ALTER TABLE `game_state` ADD `career_mode` integer DEFAULT false NOT NULL;