ALTER TABLE `staff` ADD `nationality` text DEFAULT 'ESP' NOT NULL;--> statement-breakpoint
ALTER TABLE `game_state` ADD `manager_nationality` text DEFAULT 'ESP' NOT NULL;--> statement-breakpoint
-- Las partidas de antes: el cuerpo técnico toma la nacionalidad de su club, y el
-- entrenador la del club que dirige.
UPDATE `staff` SET `nationality` = (SELECT `country` FROM `teams` WHERE `teams`.`id` = `staff`.`team_id`) WHERE `team_id` IS NOT NULL;--> statement-breakpoint
UPDATE `game_state` SET `manager_nationality` = COALESCE((SELECT `country` FROM `teams` WHERE `teams`.`id` = `game_state`.`managed_team_id`), 'ESP');
