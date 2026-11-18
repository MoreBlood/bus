CREATE TABLE `rate_periods` (
	`id` text PRIMARY KEY NOT NULL,
	`valid_from` text NOT NULL,
	`amort_per_km` real NOT NULL,
	`fuel_per100` real NOT NULL,
	`fuel_price` real NOT NULL,
	`basis` text,
	`created_by` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rate_periods_from` ON `rate_periods` (`valid_from`);--> statement-breakpoint
ALTER TABLE `trip_riders` ADD `absent` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `trips` ADD `extras_amount` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `trips` ADD `extras_paid_by` text REFERENCES members(id);--> statement-breakpoint
ALTER TABLE `trips` ADD `extras_note` text DEFAULT '' NOT NULL;--> statement-breakpoint
-- ставки, заданные до периодов, становятся первым периодом (действует «всегда»)
INSERT INTO `rate_periods` (`id`, `valid_from`, `amort_per_km`, `fuel_per100`, `fuel_price`) SELECT 'initial', '2000-01-01', coalesce(json_extract(`value`, '$.amortPerKm'), 0.3), coalesce(json_extract(`value`, '$.fuelPer100'), 11), coalesce(json_extract(`value`, '$.fuelPrice'), 6.5) FROM `settings` WHERE `key` = 'costs';
