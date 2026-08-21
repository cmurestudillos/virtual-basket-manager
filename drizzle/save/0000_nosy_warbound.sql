CREATE TABLE `competitions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`short_name` text NOT NULL,
	`country` text NOT NULL,
	`ruleset_id` text DEFAULT 'fiba' NOT NULL,
	`tier` integer DEFAULT 1 NOT NULL,
	`format` text DEFAULT 'league' NOT NULL,
	`playoff_teams` integer DEFAULT 0 NOT NULL,
	`playoff_series_length` integer DEFAULT 5 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`short_name` text NOT NULL,
	`city` text NOT NULL,
	`country` text NOT NULL,
	`competition_id` text NOT NULL,
	`crest` text,
	`pavilion_name` text NOT NULL,
	`pavilion_capacity` integer DEFAULT 5000 NOT NULL,
	`reputation` integer DEFAULT 50 NOT NULL,
	`budget_cents` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`competition_id`) REFERENCES `competitions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`nationality` text NOT NULL,
	`birth_date` integer NOT NULL,
	`position` text NOT NULL,
	`secondary_position` text,
	`height_cm` integer NOT NULL,
	`weight_kg` integer NOT NULL,
	`wingspan_cm` integer NOT NULL,
	`photo` text,
	`close` integer NOT NULL,
	`mid_range` integer NOT NULL,
	`three_point` integer NOT NULL,
	`free_throw` integer NOT NULL,
	`finishing` integer NOT NULL,
	`passing` integer NOT NULL,
	`handling` integer NOT NULL,
	`driving` integer NOT NULL,
	`perimeter_defense` integer NOT NULL,
	`interior_defense` integer NOT NULL,
	`steal` integer NOT NULL,
	`block` integer NOT NULL,
	`offensive_rebound` integer NOT NULL,
	`defensive_rebound` integer NOT NULL,
	`speed` integer NOT NULL,
	`strength` integer NOT NULL,
	`jumping` integer NOT NULL,
	`stamina` integer NOT NULL,
	`basketball_iq` integer NOT NULL,
	`consistency` integer NOT NULL,
	`aggression` integer NOT NULL,
	`potential` integer NOT NULL,
	`condition` integer DEFAULT 100 NOT NULL,
	`morale` integer DEFAULT 70 NOT NULL,
	`games_injured` integer DEFAULT 0 NOT NULL,
	`wage_cents` integer DEFAULT 0 NOT NULL,
	`contract_until` integer,
	`value_cents` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `rotation_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`player_id` text NOT NULL,
	`depth` integer NOT NULL,
	`slot_position` text NOT NULL,
	`target_minutes` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `team_tactics` (
	`team_id` text PRIMARY KEY NOT NULL,
	`offensive_system` text DEFAULT 'motion' NOT NULL,
	`defensive_system` text DEFAULT 'manToMan' NOT NULL,
	`pace` integer DEFAULT 5 NOT NULL,
	`defensive_intensity` integer DEFAULT 5 NOT NULL,
	`offensive_rebound_effort` integer DEFAULT 5 NOT NULL,
	`focus_player_id` text,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `seasons` (
	`id` text PRIMARY KEY NOT NULL,
	`competition_id` text NOT NULL,
	`season_number` integer NOT NULL,
	`start_year` integer NOT NULL,
	`current_round` integer DEFAULT 1 NOT NULL,
	`stage` text DEFAULT 'regular' NOT NULL,
	FOREIGN KEY (`competition_id`) REFERENCES `competitions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`season_id` text NOT NULL,
	`round` integer NOT NULL,
	`scheduled_on` integer NOT NULL,
	`home_team_id` text NOT NULL,
	`away_team_id` text NOT NULL,
	`home_score` integer,
	`away_score` integer,
	`period_scores` text,
	`overtimes` integer DEFAULT 0 NOT NULL,
	`played_on` integer,
	`neutral_venue` integer DEFAULT false NOT NULL,
	`seed` integer,
	`series_id` text,
	`series_game` integer,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`home_team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`away_team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_games_scheduled` ON `games` (`scheduled_on`);--> statement-breakpoint
CREATE INDEX `idx_games_season` ON `games` (`season_id`);--> statement-breakpoint
CREATE TABLE `game_player_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`player_id` text NOT NULL,
	`team_id` text NOT NULL,
	`seconds_played` integer DEFAULT 0 NOT NULL,
	`two_point_made` integer DEFAULT 0 NOT NULL,
	`two_point_attempted` integer DEFAULT 0 NOT NULL,
	`three_point_made` integer DEFAULT 0 NOT NULL,
	`three_point_attempted` integer DEFAULT 0 NOT NULL,
	`free_throw_made` integer DEFAULT 0 NOT NULL,
	`free_throw_attempted` integer DEFAULT 0 NOT NULL,
	`offensive_rebounds` integer DEFAULT 0 NOT NULL,
	`defensive_rebounds` integer DEFAULT 0 NOT NULL,
	`assists` integer DEFAULT 0 NOT NULL,
	`steals` integer DEFAULT 0 NOT NULL,
	`blocks` integer DEFAULT 0 NOT NULL,
	`turnovers` integer DEFAULT 0 NOT NULL,
	`fouls` integer DEFAULT 0 NOT NULL,
	`fouls_drawn` integer DEFAULT 0 NOT NULL,
	`plus_minus` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_game_player_stats_game` ON `game_player_stats` (`game_id`);--> statement-breakpoint
CREATE INDEX `idx_game_player_stats_player` ON `game_player_stats` (`player_id`);--> statement-breakpoint
CREATE TABLE `game_state` (
	`id` text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	`managed_team_id` text,
	`manager_name` text DEFAULT 'Entrenador' NOT NULL,
	`current_date` integer NOT NULL,
	`season_number` integer DEFAULT 1 NOT NULL
);
