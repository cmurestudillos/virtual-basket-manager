CREATE TABLE `team_training` (
	`team_id` text PRIMARY KEY NOT NULL,
	`intensity` integer DEFAULT 5 NOT NULL,
	`focus` text DEFAULT 'balanced' NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `players` ADD `injury_days_left` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `injury_name` text;--> statement-breakpoint
ALTER TABLE `players` ADD `training_focus` text;