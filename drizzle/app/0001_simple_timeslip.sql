CREATE TABLE `world_edits` (
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`data` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`entity_type`, `entity_id`)
);
