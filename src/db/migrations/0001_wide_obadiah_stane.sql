CREATE TABLE `calendar_members` (
	`id` text PRIMARY KEY NOT NULL,
	`calendar_id` text NOT NULL,
	`user_id` text NOT NULL,
	`year` integer NOT NULL,
	`role` text DEFAULT 'admin' NOT NULL,
	`joined_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`calendar_id`) REFERENCES `calendars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cm_calendar_user_idx` ON `calendar_members` (`calendar_id`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `cm_user_year_idx` ON `calendar_members` (`user_id`,`year`);--> statement-breakpoint
CREATE TABLE `calendar_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`calendar_id` text NOT NULL,
	`month` integer NOT NULL,
	`image_key` text NOT NULL,
	`image_url` text,
	`caption` text,
	`uploaded_by` text NOT NULL,
	`uploaded_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`calendar_id`) REFERENCES `calendars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cp_calendar_month_idx` ON `calendar_photos` (`calendar_id`,`month`);--> statement-breakpoint
CREATE TABLE `calendars` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`year` integer NOT NULL,
	`owner_id` text NOT NULL,
	`is_public` integer DEFAULT false NOT NULL,
	`cover_image_key` text,
	`cover_image_url` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendars_slug_unique` ON `calendars` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `calendars_slug_idx` ON `calendars` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `calendars_owner_year_idx` ON `calendars` (`owner_id`,`year`);--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`calendar_id` text NOT NULL,
	`inviter_id` text NOT NULL,
	`invitee_email` text NOT NULL,
	`invitee_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`calendar_id`) REFERENCES `calendars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inviter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invitee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inv_calendar_email_idx` ON `invitations` (`calendar_id`,`invitee_email`);