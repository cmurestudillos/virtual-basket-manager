CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `saves` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`file_name` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_played_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `saves_file_name_unique` ON `saves` (`file_name`);