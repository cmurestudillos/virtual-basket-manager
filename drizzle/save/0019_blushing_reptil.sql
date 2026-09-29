ALTER TABLE `game_state` ADD `world_seed` text;--> statement-breakpoint
-- Las partidas de antes no tenían semilla: se les tira ahora, una vez, y desde
-- aquí sus temporadas nuevas ya salen siempre igual.
UPDATE `game_state` SET `world_seed` = lower(hex(randomblob(4))) WHERE `world_seed` IS NULL;