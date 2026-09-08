-- Explicit operator recovery; never part of automatic application startup.
-- Run inside BEGIN with SET LOCAL rss2pub.recovery_origin = 'https://...'.
-- First run ends in ROLLBACK; reviewed application ends in COMMIT.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE federation_objects, federation_followers, federation_actor_keys, feeds
  IN SHARE ROW EXCLUSIVE MODE;

CREATE OR REPLACE FUNCTION pg_temp.uri_array(value jsonb) RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY(SELECT CASE uri WHEN 'as:Public'
    THEN 'https://www.w3.org/ns/activitystreams#Public' ELSE uri END
    FROM unnest(CASE jsonb_typeof(value)
    WHEN 'string' THEN ARRAY[value #>> '{}']
    WHEN 'array' THEN ARRAY(SELECT jsonb_array_elements_text(value))
    ELSE ARRAY[]::text[] END) AS uri)
$$;

-- Feed posts only: main-actor command replies can be private and contain
-- reply metadata that the new typed model does not represent.
CREATE TEMP TABLE recovery_objects ON COMMIT DROP AS
SELECT m.bot_id AS actor_handle, m.id, m.activity_json->'object' AS object
FROM botkit.messages m JOIN feeds f ON f.handle = m.bot_id;

CREATE TEMP TABLE recovery_keys ON COMMIT DROP AS
SELECT k.* FROM botkit.key_pairs k
WHERE (k.bot_id='rss2pub' OR EXISTS (SELECT FROM feeds f WHERE f.handle=k.bot_id))
  AND NOT EXISTS (SELECT FROM federation_actor_keys a WHERE a.local_handle=k.bot_id);

DO $$
DECLARE origin text := current_setting('rss2pub.recovery_origin');
BEGIN
  IF origin !~ '^https?://[^/]+$' THEN
    RAISE EXCEPTION 'recovery origin must be a canonical HTTP(S) origin';
  END IF;
  IF EXISTS (
    SELECT FROM recovery_objects r
    WHERE (object->>'type') NOT IN ('Note','Article')
       OR (object->>'id') IS DISTINCT FROM
         origin || '/ap/actor/' || actor_handle || '/' || lower(object->>'type') || '/' || id
       OR (object->>'attributedTo') IS DISTINCT FROM origin || '/ap/actor/' || actor_handle
  ) THEN
    RAISE EXCEPTION 'legacy object identity does not match the configured origin/actor';
  END IF;
  IF EXISTS (
    SELECT FROM recovery_objects
    WHERE jsonb_typeof(object->'content') IS DISTINCT FROM 'string'
       OR jsonb_typeof(object->'to') NOT IN ('string','array')
       OR (object ? 'cc' AND jsonb_typeof(object->'cc') NOT IN ('string','array'))
       OR object ? 'inReplyTo' OR object ? 'tag'
       OR NOT ('https://www.w3.org/ns/activitystreams#Public' = ANY(
         pg_temp.uri_array(object->'to') || pg_temp.uri_array(object->'cc')))
       OR (object ? 'contentMap' AND
         (SELECT count(*) FROM jsonb_object_keys(object->'contentMap')) <> 1)
  ) THEN
    RAISE EXCEPTION 'legacy feed object has unsupported content, audience or metadata';
  END IF;
  IF EXISTS (
    SELECT FROM botkit.followers b JOIN feeds f ON f.handle=b.bot_id
    WHERE b.follower_id IS DISTINCT FROM b.actor_json->>'id'
       -- This one-time import accepts hostname URLs with default ports.
       -- Other URL forms require explicit review instead of a lossy import.
       OR coalesce(b.follower_id,'') !~ '^https?://[a-zA-Z0-9.-]+(/[^[:space:]]*)?$'
       OR coalesce(b.actor_json->>'inbox','') !~ '^https?://[a-zA-Z0-9.-]+(/[^[:space:]]*)?$'
       OR (b.actor_json->'endpoints'->>'sharedInbox' IS NOT NULL AND
         b.actor_json->'endpoints'->>'sharedInbox' !~ '^https?://[a-zA-Z0-9.-]+(/[^[:space:]]*)?$')
  ) THEN
    RAISE EXCEPTION 'legacy follower identity or inbox is invalid';
  END IF;
  IF EXISTS (
    SELECT bot_id FROM recovery_keys GROUP BY bot_id
    HAVING count(*) <> 2
      OR count(*) FILTER (WHERE position=0 AND public_key_jwk->>'kty'='RSA'
        AND private_key_jwk->>'kty'='RSA') <> 1
      OR count(*) FILTER (WHERE position=1 AND public_key_jwk->>'kty'='OKP'
        AND public_key_jwk->>'crv'='Ed25519'
        AND private_key_jwk->>'kty'='OKP' AND private_key_jwk->>'crv'='Ed25519') <> 1
  ) THEN
    RAISE EXCEPTION 'legacy actor key pair is incomplete or unsupported';
  END IF;
END $$;

INSERT INTO federation_objects (
  actor_handle,id,kind,content_html,name,summary_html,source_url,language,
  to_uris,cc_uris,attributed_to_uris,mentions,published_at,updated_at
)
SELECT actor_handle,id,lower(object->>'type'),object->>'content',
  object->>'name',object->>'summary',object->>'url',
  (SELECT jsonb_object_keys(object->'contentMap') LIMIT 1),
  pg_temp.uri_array(object->'to'),pg_temp.uri_array(object->'cc'),
  pg_temp.uri_array(object->'attributedTo'),'[]'::jsonb,
  (object->>'published')::timestamptz,(object->>'updated')::timestamptz
FROM recovery_objects
ON CONFLICT (actor_handle,id) DO NOTHING;

INSERT INTO federation_followers(local_handle,actor_uri,inbox_uri,shared_inbox_uri,followed_at)
SELECT b.bot_id,b.follower_id,b.actor_json->>'inbox',
  b.actor_json->'endpoints'->>'sharedInbox',now()
FROM botkit.followers b JOIN feeds f ON f.handle=b.bot_id
ON CONFLICT (local_handle,actor_uri) DO NOTHING;

-- Existing post-transition keys remain authoritative. Only actors that have
-- no current key rows receive their original pair; never mix old/new pairs.
INSERT INTO federation_actor_keys(local_handle,algorithm,public_jwk,private_jwk,created_at)
SELECT k.bot_id,CASE k.position WHEN 0 THEN 'RSASSA-PKCS1-v1_5' ELSE 'Ed25519' END,
  k.public_key_jwk,k.private_key_jwk,now()
FROM recovery_keys k
ON CONFLICT (local_handle,algorithm) DO NOTHING;

UPDATE feeds f SET follower_count=(
  SELECT count(*) FROM federation_followers ff WHERE ff.local_handle=f.handle
);

SELECT 'objects' AS kind,count(*) FROM federation_objects
UNION ALL SELECT 'followers',count(*) FROM federation_followers
UNION ALL SELECT 'keys',count(*) FROM federation_actor_keys;
