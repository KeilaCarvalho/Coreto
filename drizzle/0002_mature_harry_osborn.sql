CREATE TABLE `daily_finance` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`payment_entries_json` text DEFAULT '[]' NOT NULL,
	`flexible_accounts_json` text DEFAULT '[]' NOT NULL,
	`bank_balances_json` text DEFAULT '[]' NOT NULL,
	`total_sales` real DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_finance_date_unique` ON `daily_finance` (`date`);--> statement-breakpoint
CREATE TABLE `employee_withdrawals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`item_name` text NOT NULL,
	`charged_value` real NOT NULL,
	`withdrawn_at` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payroll_closure_id` integer,
	`discounted_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`job_title` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`remuneration_type` text DEFAULT 'commissioned' NOT NULL,
	`base_salary` real DEFAULT 0 NOT NULL,
	`commission_rate` real DEFAULT 0 NOT NULL,
	`transport_allowance` real DEFAULT 0 NOT NULL,
	`cost_allowance` real DEFAULT 0 NOT NULL,
	`daily_rate` real DEFAULT 0 NOT NULL,
	`tiered_rates_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payroll_closures` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`month` text NOT NULL,
	`remuneration_type` text NOT NULL,
	`sales_value` real DEFAULT 0 NOT NULL,
	`store_sales_value` real DEFAULT 0 NOT NULL,
	`base_value` real DEFAULT 0 NOT NULL,
	`commission_value` real DEFAULT 0 NOT NULL,
	`allowances_value` real DEFAULT 0 NOT NULL,
	`withdrawal_discount` real DEFAULT 0 NOT NULL,
	`other_discounts_json` text DEFAULT '[]' NOT NULL,
	`other_discounts_value` real DEFAULT 0 NOT NULL,
	`bonus_value` real DEFAULT 0 NOT NULL,
	`net_value` real NOT NULL,
	`details_json` text DEFAULT '{}' NOT NULL,
	`closed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `receivables` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`description` text NOT NULL,
	`total_value` real NOT NULL,
	`installments` integer NOT NULL,
	`installment_value` real NOT NULL,
	`due_dates_json` text NOT NULL,
	`received_installments` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sales_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sale_date` text NOT NULL,
	`employee_id` integer,
	`seller_name` text NOT NULL,
	`amount` real NOT NULL,
	`category` text NOT NULL,
	`import_batch` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
