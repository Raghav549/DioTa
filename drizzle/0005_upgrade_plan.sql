CREATE TABLE IF NOT EXISTS "upi_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
	"ref" text NOT NULL,
	"amount_paise" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"txn_id" text,
	"approval_ref" text,
	"response_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	CONSTRAINT "upi_payments_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "plan" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "plan_until" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "upi_user_time" ON "upi_payments" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "upi_txn_id" ON "upi_payments" USING btree ("txn_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "upi_approval_ref" ON "upi_payments" USING btree ("approval_ref");
