CREATE TABLE `monthly_finance` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`month` text NOT NULL,
	`payment_entries_json` text DEFAULT '[]' NOT NULL,
	`accounts_payable` real DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `monthly_finance_month_unique` ON `monthly_finance` (`month`);