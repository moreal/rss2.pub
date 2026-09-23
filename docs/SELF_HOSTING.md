# Self-hosting

The application needs Node.js 24 or its container image, PostgreSQL 17 or
newer, and a stable HTTPS origin reachable by other fediverse servers. A
reverse proxy should terminate TLS and forward traffic to port 8000. The
PostgreSQL connection must be direct and always on: the Fedify queue keeps a
long-lived `LISTEN` connection, so transaction-mode poolers and databases
that scale to zero are unsuitable.
Feed and favicon requests reject private or loopback destinations, including
redirect targets, and validate the DNS address used for the socket.
`ALLOW_PRIVATE_ADDRESS` is only for local tests and is
rejected when `NODE_ENV=production`. Keep ordinary network egress controls in
place as an additional boundary around the application.

Anonymous registration is enabled with three budgets:
`REGISTRATION_ATTEMPTS_PER_HOUR` (default 60, including failed or repeated requests),
`REGISTRATION_DAILY_LIMIT` (default 20 successful new feeds in a rolling 24
hours), and `REGISTRATION_TOTAL_LIMIT` (default 1000 stored feeds). They apply
to both the web form and `@rss2pub` commands. Only one new registration fetch
is admitted at a time across app instances using a PostgreSQL advisory lock;
other attempts receive a retryable response. The hourly attempt counter is per
app process; the daily and total feed counts come from the shared database.
The web form rejects bodies over
4 KiB before parsing them. Tune these limits to the host's storage, network,
and polling capacity. At the trusted reverse proxy, also rate-limit
`POST /register` by client IP and strip untrusted forwarded-address headers.

## Single-host Compose example

After the first public release, copy `selfhost.env.example` to a private
`selfhost.env`, set `ORIGIN`, choose a URL-safe PostgreSQL password, and pin a
published `RSS2PUB_VERSION`. Apply the bundled schema before starting the app:

```sh
docker compose --env-file selfhost.env -f compose.selfhost.yml up -d db
docker compose --env-file selfhost.env -f compose.selfhost.yml run --rm app \
  node dist/web/migrate.js
docker compose --env-file selfhost.env -f compose.selfhost.yml up -d app
```

The example binds the web server only to `127.0.0.1:8000`; put an HTTPS reverse
proxy on the same host in front of it. PostgreSQL is available only inside the
Compose network and persists in the `postgres-data` volume. Back up that volume
through PostgreSQL before upgrades; see [migration policy](https://docs.rss2.pub/database-migrations).
For a different platform, use the same environment variables with the release
container and an external PostgreSQL service.

For this Compose example, stop the app and write a database backup before
changing `RSS2PUB_VERSION`:

```sh
docker compose --env-file selfhost.env -f compose.selfhost.yml stop app
docker compose --env-file selfhost.env -f compose.selfhost.yml exec -T db \
  pg_dump -U rss2pub -d rss2pub --format=custom > rss2pub-before-upgrade.dump
```

Keep the backup private. Update the version in `selfhost.env`, then pull and
migrate that version before starting the app:

```sh
docker compose --env-file selfhost.env -f compose.selfhost.yml pull app
docker compose --env-file selfhost.env -f compose.selfhost.yml run --rm app \
  node dist/web/migrate.js
docker compose --env-file selfhost.env -f compose.selfhost.yml up -d app
```

`ORIGIN` must be the final scheme and host, without a path, query, or fragment.
Do not change it after remote servers begin following actors. Set
`BEHIND_PROXY=true` only when a trusted reverse proxy fronts the service.
Use `/healthz` for liveness and `/readyz` for readiness.

The footer links to the source code through `SOURCE_URL`. The default points
to this repository. If you deploy modified code, set `SOURCE_URL` to the
publicly available corresponding source for that deployed version, including
your changes. See the [GNU AGPLv3 network-source guidance](https://www.gnu.org/licenses/gpl-faq.en.html).
Third-party packages and the W3C test corpus retain their own licenses.

The first public install uses a new database. If an earlier private instance
used the same `ORIGIN`, do not silently replace its database: remote servers
may still hold actor IDs and keys from that instance. Keep the old database or
choose a new origin and establish new actor identities.
