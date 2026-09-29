CREATE TABLE "abuse_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_uri" text NOT NULL,
	"local_handle" text NOT NULL,
	"object_uris" text[] NOT NULL,
	"comment" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "blocked_feeds" (
	"url" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"blocked_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "abuse_reports_closed_received_idx" ON "abuse_reports" USING btree ("closed_at","received_at");