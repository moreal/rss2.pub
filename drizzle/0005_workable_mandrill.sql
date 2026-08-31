CREATE TABLE "federation_actor_keys" (
	"local_handle" text NOT NULL,
	"algorithm" text NOT NULL,
	"public_jwk" jsonb NOT NULL,
	"private_jwk" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "federation_actor_keys_local_handle_algorithm_pk" PRIMARY KEY("local_handle","algorithm")
);
--> statement-breakpoint
CREATE TABLE "federation_followers" (
	"local_handle" text NOT NULL,
	"actor_uri" text NOT NULL,
	"inbox_uri" text NOT NULL,
	"shared_inbox_uri" text,
	"followed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "federation_followers_local_handle_actor_uri_pk" PRIMARY KEY("local_handle","actor_uri")
);
--> statement-breakpoint
CREATE TABLE "federation_objects" (
	"actor_handle" text NOT NULL,
	"id" text NOT NULL,
	"kind" text NOT NULL,
	"content_html" text NOT NULL,
	"name" text,
	"summary_html" text,
	"source_url" text,
	"language" text,
	"to_uris" text[] NOT NULL,
	"cc_uris" text[] NOT NULL,
	"attributed_to_uris" text[] NOT NULL,
	"mentions" jsonb NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "federation_objects_actor_handle_id_pk" PRIMARY KEY("actor_handle","id")
);
--> statement-breakpoint
CREATE INDEX "federation_followers_local_handle_idx" ON "federation_followers" USING btree ("local_handle");--> statement-breakpoint
CREATE INDEX "federation_objects_actor_published_idx" ON "federation_objects" USING btree ("actor_handle","published_at" DESC NULLS LAST);