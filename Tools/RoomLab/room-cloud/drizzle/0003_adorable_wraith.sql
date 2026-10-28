CREATE TABLE `node_metadata` (
	`workspace` text NOT NULL,
	`revision_id` text NOT NULL,
	`parent_id` text,
	`deleted_at` integer,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`workspace`, `revision_id`)
);
--> statement-breakpoint
CREATE TABLE `workspace_graph` (
	`workspace` text PRIMARY KEY NOT NULL,
	`generation` integer NOT NULL,
	`operation_id` text NOT NULL
);
