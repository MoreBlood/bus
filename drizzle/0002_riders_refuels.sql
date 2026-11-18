CREATE TABLE `refuels` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`odometer` integer,
	`liters` real NOT NULL,
	`amount` integer NOT NULL,
	`paid_by` text,
	`full` integer DEFAULT true NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_by` text,
	`updated_by` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text,
	FOREIGN KEY (`paid_by`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "refuels_positive" CHECK("refuels"."liters" > 0 AND "refuels"."amount" > 0)
);
--> statement-breakpoint
CREATE INDEX `refuels_date` ON `refuels` (`date`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`from_id` text,
	`to_id` text,
	`amount` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`from_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "transfers_positive" CHECK("transfers"."amount" > 0)
);
--> statement-breakpoint
CREATE INDEX `transfers_date` ON `transfers` (`date`);--> statement-breakpoint
CREATE TABLE `trip_riders` (
	`trip_id` text NOT NULL,
	`member_id` text NOT NULL,
	`guests` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`trip_id`, `member_id`),
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "trip_riders_guests" CHECK("trip_riders"."guests" >= 0)
);
--> statement-breakpoint
CREATE INDEX `trip_riders_member` ON `trip_riders` (`member_id`);--> statement-breakpoint
DROP INDEX `trips_member`;--> statement-breakpoint
ALTER TABLE `trips` ADD `shared` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- перенос: у кого была личная поездка — тот её единственный участник; без участника — поездка по делам буса
INSERT INTO `trip_riders` (`trip_id`, `member_id`, `guests`) SELECT `id`, `member_id`, 0 FROM `trips` WHERE `member_id` IS NOT NULL;--> statement-breakpoint
UPDATE `trips` SET `shared` = 1 WHERE `member_id` IS NULL;
