CREATE TABLE `branches` (
	`workspace` text NOT NULL,
	`name` text NOT NULL,
	`head` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`workspace`, `name`)
);
--> statement-breakpoint
CREATE TABLE `revisions` (
	`workspace` text NOT NULL,
	`id` text NOT NULL,
	`data` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`workspace`, `id`)
);
