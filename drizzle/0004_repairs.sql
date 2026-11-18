CREATE TABLE `repairs` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`odometer` integer,
	`kind` text DEFAULT 'repair' NOT NULL,
	`title` text NOT NULL,
	`amount` integer NOT NULL,
	`paid_by` text,
	`charged_to` text,
	`note` text DEFAULT '' NOT NULL,
	`created_by` text,
	`updated_by` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text,
	FOREIGN KEY (`paid_by`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`charged_to`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "repairs_positive" CHECK("repairs"."amount" > 0)
);
--> statement-breakpoint
CREATE INDEX `repairs_date` ON `repairs` (`date`);