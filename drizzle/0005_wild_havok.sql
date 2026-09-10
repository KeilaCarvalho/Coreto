ALTER TABLE `sales_records` ADD `quantity` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `sales_records` ADD `sale_count` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `sales_records` ADD `record_type` text DEFAULT 'detailed' NOT NULL;--> statement-breakpoint
ALTER TABLE `sales_records` ADD `report_month` text;--> statement-breakpoint
ALTER TABLE `sales_records` ADD `source_file_name` text;