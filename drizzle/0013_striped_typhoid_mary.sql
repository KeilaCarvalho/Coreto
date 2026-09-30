CREATE TABLE `dre_months` (
	`month` text PRIMARY KEY NOT NULL,
	`entries_json` text DEFAULT '[]' NOT NULL,
	`mapping_json` text DEFAULT '{}' NOT NULL,
	`inputs_json` text DEFAULT '{}' NOT NULL,
	`file_name` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
