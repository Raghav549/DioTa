CREATE TABLE IF NOT EXISTS "user_avatars" (
	"user_id" uuid PRIMARY KEY NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
	"mime" text NOT NULL,
	"data" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "monitored_apps" ADD COLUMN IF NOT EXISTS "name" text;--> statement-breakpoint
ALTER TABLE "monitored_apps" ADD COLUMN IF NOT EXISTS "package_name" text;--> statement-breakpoint
ALTER TABLE "monitored_apps" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "monitored_apps" ADD COLUMN IF NOT EXISTS "data_bytes" bigint;--> statement-breakpoint
ALTER TABLE "monitored_apps" ADD COLUMN IF NOT EXISTS "last_used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "monitored_apps" ADD COLUMN IF NOT EXISTS "blocked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "monitored_apps" ADD COLUMN IF NOT EXISTS "blocked_attempts" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "monitored_apps" ADD COLUMN IF NOT EXISTS "icon" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_updated_at" timestamp with time zone;
