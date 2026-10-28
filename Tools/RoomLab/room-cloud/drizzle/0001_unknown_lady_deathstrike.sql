CREATE TABLE `chunks` (
	`workspace` text NOT NULL,
	`hash` text NOT NULL,
	`size` integer NOT NULL,
	PRIMARY KEY(`workspace`, `hash`)
);
