CREATE TABLE `corrections` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`title` text NOT NULL,
	`old_text` text NOT NULL,
	`new_text` text NOT NULL,
	`reference` text NOT NULL,
	`reference_url` text NOT NULL,
	`reason` text NOT NULL,
	`last_run_id` text,
	`is_demo` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `corrections_space` ON `corrections` (`space_id`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`kind` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`mutation_id` text NOT NULL,
	`is_demo` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `documents_space` ON `documents` (`space_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`entity_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`actor_role` text NOT NULL,
	`action` text NOT NULL,
	`details` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `events_space_created` ON `events` (`space_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `findings` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`correction_id` text NOT NULL,
	`run_id` text NOT NULL,
	`document_id` text NOT NULL,
	`document_version` integer NOT NULL,
	`quote` text NOT NULL,
	`reason` text NOT NULL,
	`verdict` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`reviewed_by` text DEFAULT '' NOT NULL,
	`reviewed_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`correction_id`) REFERENCES `corrections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `findings_space_doc` ON `findings` (`space_id`,`document_id`);--> statement-breakpoint
CREATE INDEX `findings_run` ON `findings` (`run_id`);--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_space_email` ON `members` (`space_id`,`email`);--> statement-breakpoint
CREATE INDEX `members_email` ON `members` (`email`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`correction_id` text NOT NULL,
	`engine` text NOT NULL,
	`status` text NOT NULL,
	`actor` text NOT NULL,
	`doc_count` integer NOT NULL,
	`elapsed_ms` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`correction_id`) REFERENCES `corrections`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `runs_correction` ON `runs` (`correction_id`);--> statement-breakpoint
CREATE TABLE `spaces` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `spaces_owner` ON `spaces` (`owner_id`);