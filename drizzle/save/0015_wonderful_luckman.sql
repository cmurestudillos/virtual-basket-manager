CREATE TABLE `draft_picks` (
	`id` text PRIMARY KEY NOT NULL,
	`competition_id` text NOT NULL,
	`season_number` integer NOT NULL,
	`round` integer NOT NULL,
	`pick` integer NOT NULL,
	`team_id` text NOT NULL,
	`player_id` text,
	`lottery_winner` integer DEFAULT false NOT NULL,
	`passed` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`competition_id`) REFERENCES `competitions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_draft_picks_season` ON `draft_picks` (`season_number`);--> statement-breakpoint
ALTER TABLE `competitions` ADD `nba_format` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `teams` ADD `conference` text;--> statement-breakpoint
ALTER TABLE `teams` ADD `division` text;--> statement-breakpoint
ALTER TABLE `players` ADD `draft_class` integer;--> statement-breakpoint
-- Las partidas de antes pasan la liga americana al formato NBA, salvo que estén
-- en mitad de sus playoffs: esas cambian al crear la temporada siguiente.
UPDATE `competitions` SET `nba_format` = 1, `playoff_teams` = 16 WHERE `id` = 'usa-1' AND NOT EXISTS (SELECT 1 FROM `seasons` WHERE `competition_id` = 'usa-1' AND `stage` = 'playoffs');
