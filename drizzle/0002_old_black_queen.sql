CREATE TABLE `guest_analysis_budget` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `guest_budget_space` ON `guest_analysis_budget` (`space_id`);--> statement-breakpoint
CREATE INDEX `guest_budget_created` ON `guest_analysis_budget` (`created_at`);--> statement-breakpoint
CREATE TABLE `guest_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `guest_created` ON `guest_sessions` (`created_at`);