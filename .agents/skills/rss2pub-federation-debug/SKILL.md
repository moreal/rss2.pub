---
name: rss2pub-federation-debug
description: Use when a running rss2.pub deployment has ActivityPub discovery, Follow, delivery, signature, or missing-object failures and homelab deployment logs are needed.
---

# rss2.pub federation debugging

Collect production evidence and trace the failing boundary before proposing a repair. A healthy web server does not prove federation delivery. Default repositories are `~/github/moreal/rss2.pub` and `~/github/moreal/homelab`; respect supplied alternatives and read their AGENTS.md files.

## Discover the deployed configuration

Read these homelab sources; use current values rather than remembered addresses:

- `inventory/hosts.json`: public origin, Grafana route, monitor and Talos addresses.
- `gitops/apps/rss2pub/deployment.yaml`: image digest, namespace/container, ORIGIN, proxy and logging configuration. The checked-out manifest is desired state, not proof of the live image.
- `gitops/infrastructure/alloy/config.yaml`: pod log labels and Loki destination.
- `nixos/roles/monitoring.nix`: Grafana datasource UID and authentication, Loki retention (currently 14 days), Tempo configuration.
- `justfile`: kubeconfig generation and SSH recipes. Run homelab recipes as `nix develop --command just ...` from that repository.

## Retrieve logs

Start with a bounded recent window (6h, then 24h if needed), including all severity levels so ingestion freshness can be checked. Preserve timestamps, logger, pod, requestId/traceId and the structured `properties.error`; JSON `message` may render an exception as `{}` even though its structured stack is available.

### Kubernetes, when the LAN is reachable

Use the existing `.local/talos-kubeconfig` without displaying it:

```sh
kubectl --kubeconfig "$HOME/github/moreal/homelab/.local/talos-kubeconfig" --request-timeout=15s -n rss2pub get pods -o wide
kubectl --kubeconfig "$HOME/github/moreal/homelab/.local/talos-kubeconfig" --request-timeout=15s -n rss2pub logs -l app=rss2pub -c rss2pub --since=6h --timestamps --prefix --tail=2000
```

Inspect every replica; use `logs POD -c rss2pub --previous` for a restarted container. Previous logs cover only the previous container instance. Historical replaced pods require Loki. Do not print Secrets, kubeconfig credentials, DATABASE_URL, or private actor keys.

### Grafana HTTPS, including when LAN access fails

`No route to host` on Kubernetes is not a service outage. Alloy collects logs independently of the workstation. Open the inventory-derived Grafana HTTPS host using an existing authenticated session, Explore → Loki, query:

```logql
{namespace="rss2pub",container="rss2pub"}
```

For repeatable API collection, run the bundled standard-library Python helper:

```sh
python3 <skill-directory>/scripts/query_logs.py --since 24h --limit 2000
```

It derives the Grafana host and encrypted monitoring secret location from inventory, decrypts only `grafana_admin_password` using existing SOPS access, and uses HTTPS Basic authentication to `/api/datasources/proxy/uid/loki/loki/api/v1/query_range`. Passwords remain in process memory; authenticated redirects are refused. It writes raw logs to a unique mode-0600 temporary file and prints only counts and the path. Read only relevant records from that file, and redact credentials or private message content from reports. Dependencies: Python 3, `sops`, and existing authorized age-key access. If authentication is unavailable, use the existing Grafana session or request access; do not change auth settings or expose Loki publicly.

Use `--homelab PATH` for another checkout and `--query LOGQL` for a narrower selector. If `possibly_truncated` is true, narrow the window/selector before drawing frequency conclusions. An empty or stale stream is an observability gap, not proof of no errors. Direct Loki on monitor port 3100 is an alternative only from the reachable trusted LAN; WireGuard alone does not route the LAN through the VPS. For Kubernetes/DB investigation, an SSH ProxyCommand through the inventory VPS to the edge WireGuard address can provide a localhost-only tunnel to the Talos API. Verify both host keys using homelab `.local/known_hosts` (use `HostKeyAlias=edge` for the WireGuard address), bind the forward to `127.0.0.1`, and use the original API IP as kubectl `--tls-server-name`. Close the tunnel after the investigation; never disable TLS or host-key checks.

## Trace the failure

| Evidence | Next check |
| --- | --- |
| Health/readiness 200 | Check WebFinger, actor JSON and the affected object separately. |
| `federation delivery failed` | Inspect structured exception: this catch includes local lookup/persistence failures before any send. |
| `message not found: URI` in `update` | Trace `published_items.message_uri` into `federation_objects` lookup; GET the exact URI with ActivityPub Accept. |
| Existing object, remote post missing | Inspect persisted followers, queue startup/errors and recipient-specific delivery evidence. Persistence is not receipt. |
| `keyFetchError` / inbox 401 | Correlate requestId/traceId with document-loader status; a remote key URL returning 410 differs from a signature mismatch. |
| `federation queue stopped` | Inspect startup and Postgres LISTEN/MQ errors; startQueue must not be awaited. |
| HTTP profile URL under HTTPS origin | Check proxy handling and uses of ctx.origin; do not assume this explains unrelated exceptions. |

Useful source files in rss2.pub:

- `src/infrastructure/federation/fedify-stack.ts`: routes, object lookup, outbox, queue startup.
- `fedify-gateway.ts` in the same directory: persists objects before send; update requires an existing stored object.
- `src/application/poll-feed.ts`: update selection using published item URI/fingerprint.
- `src/infrastructure/persistence/schema.ts` and `drizzle-federation-repository.ts`: persisted identity and state.
- `src/infrastructure/telemetry/logging.ts`: app logs default to info, Fedify to warning. Read wiring before assuming LOG_LEVEL enables Fedify debug logs.
- `docs/adr/0013-raw-fedify-over-botkit.md` and `drizzle/0005_workable_mandrill.sql`: BotKit state was deliberately not migrated; new tables are created without backfill. Treat migration as a hypothesis until old references and absent rows are established.

Read-only production SQL, when DB access is available, should compare affected published item URIs with matching actor handle/object ID rows. Select identifiers/counts rather than private keys or whole records. Keep the exact original object IDs when evaluating a recovery strategy. Do not reset the DB, rotate actor keys, purge queues, republish, change subscriptions, send activities, or deploy as part of log collection. A repair requiring those changes needs a concrete, separately authorized plan.

## Report and verify

Report the collection window/timezone, log count and any truncation, confirmed failing boundary, source line, plausible cause versus unverified history, and the next discriminating check. Keep raw production logs outside Git. Test public endpoints with GET only and record status/content type plus relevant IDs, avoiding full actor keys or activity bodies.

Run the helper and skill validator after modifying this skill. For repository changes, follow its quality gate (`yarn typecheck && yarn test`). State operational limits honestly: successful tests or object persistence do not establish that a remote instance received an activity.

## Follow-up: dedicated logging credential

The owner plans to replace temporary Grafana administrator Basic authentication with a dedicated service-account token for log queries. Track this before routine unattended use: create the token with the narrowest available read permissions, store it encrypted in homelab SOPS, update the helper to use Bearer authentication, and verify it can query Loki without administrative operations. Keep credentials out of Git and command-line arguments. Token creation is a separate follow-up; this skill currently uses the explicitly accepted existing Basic-auth method.
