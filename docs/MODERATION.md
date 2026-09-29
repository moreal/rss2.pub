# Moderation

rss2.pub receives federated abuse reports as ActivityStreams `Flag` activities.
`Flag` is the standard report activity in the [Activity Vocabulary](https://www.w3.org/TR/activitystreams-vocabulary/#dfn-flag).
[Mastodon sends remote reports](https://docs.joinmastodon.org/spec/activitypub/#Flag) from its instance actor, with the reported account and posts in `object` and the comment in `content`.
The main `rss2pub` actor and feed actors accept these activities at their inboxes. A report is stored only when at least one reported object is a current local actor or Note; duplicate activity IDs are ignored. Reports are private database rows and are never published in an outbox.

[FEP-3b86](https://fediverse.codeberg.page/fep/fep/3b86/#flag-intent) proposes a `Flag` intent for discovering a report UI. It is a draft and is separate from receiving `Flag` activities. [FEP-d556](https://fediverse.codeberg.page/fep/fep/d556/) describes server-level actors for moderation traffic; rss2.pub already has the main actor for that purpose. This implementation uses the existing actor inboxes and does not advertise an intent endpoint.

## Operator commands

Run with the same `DATABASE_URL` and other configuration as the server:

```sh
yarn moderate reports                       # open reports as JSON
yarn moderate close <report-id>             # mark a reviewed report closed
yarn moderate block <feed-url> <reason>     # prevent registration and remove any actor
yarn moderate remove <handle>               # remove an actor without blocking its URL
```

The Nix package exposes the same commands as `rss2pub-moderate`. Blocking uses the canonical feed URL and applies to both direct registration and website discovery. Removal sends the actor `Delete` before deleting local state; the command reports if federation delivery failed. Keep the database and report output private because reports may contain sensitive comments and actor identifiers.
