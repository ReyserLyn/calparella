PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_calendar_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`calendar_id` text NOT NULL,
	`month` integer NOT NULL,
	`day` integer NOT NULL,
	`image_key` text NOT NULL,
	`image_url` text,
	`caption` text,
	`uploaded_by` text NOT NULL,
	`uploaded_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`calendar_id`) REFERENCES `calendars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_calendar_photos`("id", "calendar_id", "month", "day", "image_key", "image_url", "caption", "uploaded_by", "uploaded_at") SELECT "id", "calendar_id", "month", "day", "image_key", "image_url", "caption", "uploaded_by", "uploaded_at" FROM `calendar_photos`;--> statement-breakpoint
DROP TABLE `calendar_photos`;--> statement-breakpoint
ALTER TABLE `__new_calendar_photos` RENAME TO `calendar_photos`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `cp_calendar_month_idx` ON `calendar_photos` (`calendar_id`,`month`);--> statement-breakpoint
ALTER TABLE `invitations` ADD `token` text NOT NULL;--> statement-breakpoint
ALTER TABLE `invitations` ADD `role` text DEFAULT 'admin' NOT NULL;--> statement-breakpoint
ALTER TABLE `invitations` ADD `expires_at` integer NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_token_unique` ON `invitations` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `inv_token_idx` ON `invitations` (`token`);