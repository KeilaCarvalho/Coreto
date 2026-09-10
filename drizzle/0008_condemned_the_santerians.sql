CREATE TABLE `app_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'vendedora' NOT NULL,
	`seller_name` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_users_email_unique` ON `app_users` (`email`);--> statement-breakpoint
CREATE TABLE `crm_customers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`external_code` text,
	`name` text NOT NULL,
	`cpf` text,
	`birth_date` text,
	`phone` text,
	`phone_2` text,
	`email` text,
	`city` text,
	`state` text,
	`responsible_seller` text,
	`first_purchase_at` text,
	`last_purchase_at` text,
	`purchase_count` integer DEFAULT 0 NOT NULL,
	`pieces_count` integer DEFAULT 0 NOT NULL,
	`total_spent` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'not_contacted' NOT NULL,
	`next_contact_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_customers_external_code_unique` ON `crm_customers` (`external_code`);--> statement-breakpoint
CREATE TABLE `crm_imports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`import_batch` text NOT NULL,
	`file_name` text NOT NULL,
	`report_type` text NOT NULL,
	`report_month` text,
	`record_count` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_imports_import_batch_unique` ON `crm_imports` (`import_batch`);--> statement-breakpoint
CREATE TABLE `crm_interactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`customer_id` integer NOT NULL,
	`user_email` text NOT NULL,
	`status` text NOT NULL,
	`note` text NOT NULL,
	`contacted_at` text NOT NULL,
	`next_contact_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `crm_customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `crm_sales` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sale_code` text NOT NULL,
	`customer_id` integer,
	`customer_name` text NOT NULL,
	`seller_name` text NOT NULL,
	`sale_date` text NOT NULL,
	`amount` real DEFAULT 0 NOT NULL,
	`product_value` real DEFAULT 0 NOT NULL,
	`exchange_value` real DEFAULT 0 NOT NULL,
	`variation_value` real DEFAULT 0 NOT NULL,
	`import_batch` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `crm_customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_sales_sale_code_unique` ON `crm_sales` (`sale_code`);