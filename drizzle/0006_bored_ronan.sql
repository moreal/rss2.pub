ALTER TABLE "feeds" ADD COLUMN "unchanged_polls" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "feeds" ADD COLUMN "icon_failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "feeds" ADD COLUMN "icon_next_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "published_items" ADD COLUMN "full_content_used" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "published_items" ADD COLUMN "extract_failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "published_items" ADD COLUMN "extract_next_attempt_at" timestamp with time zone;