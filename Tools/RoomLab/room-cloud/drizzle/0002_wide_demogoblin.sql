CREATE TABLE `live_drafts` (
	`workspace` text NOT NULL,
	`channel` text NOT NULL,
	`seq` integer NOT NULL,
	`data` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`workspace`, `channel`)
);
--> statement-breakpoint
CREATE TABLE `live_sessions` (
	`workspace` text NOT NULL,
	`channel` text NOT NULL,
	`device` text NOT NULL,
	`seen` integer NOT NULL,
	PRIMARY KEY(`workspace`, `channel`, `device`)
);
