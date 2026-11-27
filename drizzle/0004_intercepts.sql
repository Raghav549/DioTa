CREATE TABLE IF NOT EXISTS "intercepts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
	"app_slug" text NOT NULL,
	"category" text NOT NULL,
	"kind" text NOT NULL,
	"trigger" text NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"first_at" timestamp with time zone NOT NULL,
	"last_at" timestamp with time zone NOT NULL,
	"detail_enc" text NOT NULL,
	"dedupe_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "intercepts_user_time" ON "intercepts" USING btree ("user_id","last_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "intercepts_user_app" ON "intercepts" USING btree ("user_id","app_slug","last_at");--> statement-breakpoint
ALTER TABLE "intercepts" ADD COLUMN IF NOT EXISTS "dedupe_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "intercepts_user_dedupe" ON "intercepts" USING btree ("user_id","dedupe_key");--> statement-breakpoint
ALTER TABLE "vault_items" ADD COLUMN IF NOT EXISTS "source_key" text;--> statement-breakpoint
ALTER TABLE "vault_items" ADD COLUMN IF NOT EXISTS "meta_enc" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vault_user_source" ON "vault_items" USING btree ("user_id","source_key");
