ALTER TABLE `teams` ADD `youth_level` integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `is_youth` integer DEFAULT false NOT NULL;