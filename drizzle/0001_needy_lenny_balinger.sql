ALTER TABLE "feeds" DROP CONSTRAINT "feeds_url_unique";--> statement-breakpoint
ALTER TABLE "feeds" ADD COLUMN "full_content_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "feeds_url_full_content_enabled_idx" ON "feeds" USING btree ("url","full_content_enabled");