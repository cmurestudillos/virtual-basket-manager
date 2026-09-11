CREATE TABLE `staff` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`role` text NOT NULL,
	`level` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE set null
);
