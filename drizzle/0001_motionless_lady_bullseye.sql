DROP INDEX `spaces_owner`;--> statement-breakpoint
CREATE INDEX `spaces_owner` ON `spaces` (`owner_id`);