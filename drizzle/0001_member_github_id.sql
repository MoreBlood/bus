ALTER TABLE `members` ADD `github_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `members_github_id` ON `members` (`github_id`) WHERE "members"."github_id" IS NOT NULL;