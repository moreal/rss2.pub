# Database migration policy

`drizzle/` contains the executable, ordered PostgreSQL SQL migrations.
`src/web/migrate.ts` applies them to `DATABASE_URL` and exits. The initial public
release includes migrations `0000` through `0008`; applying them to an empty
PostgreSQL database is the baseline. Private pre-release databases are outside
the supported upgrade path.

## Authoring migrations

- Change `src/infrastructure/persistence/schema.ts` first, then generate a new
  migration with `yarn drizzle-kit generate`. Commit the SQL, journal, and
  snapshot together. Review generated SQL and data effects before merging.
- Once a migration has shipped in a tagged release, never edit, reorder, delete,
  or renumber it. Add a subsequent migration to correct it. Do not use
  `drizzle-kit push` against an operator database.
- Prefer additive changes that allow the old and new application versions to
  coexist during a short upgrade. Split destructive changes into separate
  releases when needed. Document any downtime or data rewrite explicitly.
- A schema change must pass fresh-database tests. From the second public
  release onward, also test upgrading a database created by the immediately
  previous stable release, including preserved actor keys, followers, and
  objects. If an upgrade cannot preserve them, treat it as a breaking release.
- The migration command is safe to rerun: Drizzle records applied migrations
  and only applies pending files. Server startup retains automatic migration
  for existing deployments, but operators should run the command explicitly
  while the application is stopped. Never start multiple new instances against
  the same DB during a migration. Investigate a failed migration before retrying.

## Running the bundled code

The command needs only `DATABASE_URL`; it reads the SQL packaged with the same
version of the application. Run it against an empty database for a first install
or against a backed-up database before an upgrade:

```sh
yarn db:migrate                         # source checkout; reads .env if present
node dist/web/migrate.js                # built app or container
rss2pub-migrate                         # Nix package
```

For a container, override its default command with
`node dist/web/migrate.js` and provide the same `DATABASE_URL` used by the app.
The command exits nonzero on failure and closes its database connection. The
e2e suite runs the actual command against an empty PostgreSQL database and
reruns it to verify idempotence.

## Operator upgrade

1. Read the target release's changelog and migration notes. Pin the target
   image version. Keep the old image available.
2. Stop the application and take a consistent PostgreSQL backup, including
   Fedify queue/KV state, actor keys, followers, and objects. Treat backups as
   secrets; actor private keys are stored in the database. For example:

   ```sh
   pg_dump --format=custom --file=rss2pub-before-upgrade.dump "$DATABASE_URL"
   ```

3. Run the **new version's migration command** while the application is stopped.
   If it fails, keep the application stopped and investigate. Then start one
   instance of the new version and wait for `/readyz`; restore the intended
   replica count after checking logs.
4. Check actor and object URLs, a feed poll, and a remote follow on the updated
   instance. Keep the backup until the upgrade is verified.

There is no automatic down migration. If the upgrade fails after a schema
change, stop the new application and restore the backup into a separate clean
database before restarting the old version. Test the restore procedure before
depending on it in production. Never point an older binary at a newer schema.

`ORIGIN` is part of ActivityPub identity. Changing it, or replacing a live
database with an empty one under the same origin, loses the persisted actor
keys and follower relationships and is not an ordinary schema migration.
