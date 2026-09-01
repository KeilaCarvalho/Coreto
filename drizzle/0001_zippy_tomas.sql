CREATE TABLE `cut_batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`model` text NOT NULL,
	`work_days_json` text NOT NULL,
	`total_cost` real NOT NULL,
	`quantity` integer NOT NULL,
	`cost_per_piece` real NOT NULL,
	`finished_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `price_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`technical_sheet_id` integer NOT NULL,
	`practiced_price` real NOT NULL,
	`real_margin_rate` real NOT NULL,
	`defined_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`technical_sheet_id`) REFERENCES `technical_sheets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `pricing_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`simple_rate` real DEFAULT 0 NOT NULL,
	`card_rate` real DEFAULT 0 NOT NULL,
	`commission_rate` real DEFAULT 0 NOT NULL,
	`fixed_expense_rate` real DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `supplies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`unit` text NOT NULL,
	`unit_value` real NOT NULL,
	`supplier` text NOT NULL,
	`invoice_date` text NOT NULL,
	`invoice_number` text,
	`observation` text,
	`source_file_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `technical_sheets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reference` text NOT NULL,
	`variant` text,
	`materials_json` text NOT NULL,
	`labor_json` text NOT NULL,
	`material_cost` real NOT NULL,
	`labor_cost` real NOT NULL,
	`total_cost` real NOT NULL,
	`simple_rate` real DEFAULT 0 NOT NULL,
	`card_rate` real DEFAULT 0 NOT NULL,
	`commission_rate` real DEFAULT 0 NOT NULL,
	`fixed_expense_rate` real DEFAULT 0 NOT NULL,
	`desired_profit_rate` real DEFAULT 0 NOT NULL,
	`current_price` real,
	`priced_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
