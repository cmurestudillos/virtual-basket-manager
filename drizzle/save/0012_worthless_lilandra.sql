CREATE TABLE `inbox_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`created_on` integer NOT NULL,
	`season_number` integer NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`route_name` text,
	`route_params` text,
	`read` integer DEFAULT false NOT NULL,
	`press_conference_id` text
);
--> statement-breakpoint
CREATE INDEX `idx_inbox_created` ON `inbox_messages` (`created_on`);--> statement-breakpoint
CREATE TABLE `press_conferences` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text,
	`created_on` integer NOT NULL,
	`topic` text NOT NULL,
	`question` text NOT NULL,
	`answer_tone` text,
	`reaction` text,
	`expired` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `game_state` ADD `inbox_snapshot` text;