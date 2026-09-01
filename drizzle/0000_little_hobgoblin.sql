CREATE TABLE `receipts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`received_at` text NOT NULL,
	`model` text NOT NULL,
	`color` text NOT NULL,
	`size` text NOT NULL,
	`quantity` integer NOT NULL,
	`checked_by` text NOT NULL,
	`checked_by_email` text,
	`observation` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE VIEW `product_variant_suggestions` AS SELECT model, color, size, MAX(received_at) AS last_received_at, SUM(quantity) AS total_received FROM receipts GROUP BY model, color, size;