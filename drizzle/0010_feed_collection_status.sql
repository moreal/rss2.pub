ALTER TABLE "feeds" ADD COLUMN "last_polled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "feeds" ADD COLUMN "last_successful_poll_at" timestamp with time zone;