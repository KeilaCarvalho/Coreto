CREATE TABLE `receipt_batch_tracking` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`batch_key` text NOT NULL,
	`model` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`pending_note` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `receipt_batch_tracking_batch_key_unique` ON `receipt_batch_tracking` (`batch_key`);--> statement-breakpoint
ALTER TABLE `receipts` ADD `batch_key` text DEFAULT '' NOT NULL;