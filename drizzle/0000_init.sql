CREATE TABLE "feeds" (
	"id" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"handle" text NOT NULL,
	"title" text,
	"description" text,
	"registered_at" timestamp with time zone NOT NULL,
	"etag" text,
	"last_modified" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"next_poll_at" timestamp with time zone NOT NULL,
	"follower_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "feeds_url_unique" UNIQUE("url"),
	CONSTRAINT "feeds_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
CREATE TABLE "published_items" (
	"feed_id" text NOT NULL,
	"key" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	CONSTRAINT "published_items_feed_id_key_pk" PRIMARY KEY("feed_id","key")
);
--> statement-breakpoint
ALTER TABLE "published_items" ADD CONSTRAINT "published_items_feed_id_feeds_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."feeds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feeds_next_poll_at_idx" ON "feeds" USING btree ("next_poll_at");--> statement-breakpoint
CREATE INDEX "feeds_follower_count_idx" ON "feeds" USING btree ("follower_count");