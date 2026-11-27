ALTER TABLE "users" ALTER COLUMN "theme" SET DEFAULT 'light';--> statement-breakpoint
-- Accounts still on the old implicit default switch to the new light default.
UPDATE "users" SET "theme" = 'light' WHERE "theme" = 'system';
