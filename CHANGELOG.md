# Changelog

Notable user-facing and operator-facing changes are recorded here. Releases use
the format described in [the release policy](https://docs.rss2.pub/releasing).

## [Unreleased]

### Added

- Direct remote follow from registration results, with account-name copying as an alternative.
- Feed source-check status, last successful check, and next scheduled check on result and actor pages.
- Explicit website feed choices with titles and recent posts, bounded by eight candidates and a 45-second request budget.

- AGPLv3-or-later licensing and a configurable link to the deployed source.
- Self-hosting, release, and database migration policies.
- A standalone database migration command for local, container, and Nix installs.
- Public-address checks for feed and favicon fetches, including redirect targets.
- Anonymous registration budgets for attempts, daily additions, stored feeds,
  concurrent fetches, and web request bodies.
- English and Korean documentation at `docs.rss2.pub`.

### Changed

- Upgrade the Fedify dependency family to 2.4.1, including the 2.4 minor
  release and security fixes for actor authentication, outbound delivery SSRF,
  unbounded document reads, and alternate document link traversal. Redeploy
  to activate the fixes; no application database migration is required.

- Registration errors now offer recovery steps and links specific to the failure. Temporary limits include retry advice without marking the URL invalid.
- Migration `0010` records feed-check timestamps without fabricating past history.
- Cross-document view transitions are disabled when JavaScript is off so repeated form submissions remain usable.

- The RSS 2.0 parser now consumes the core specification's channel and item
  elements (enclosure, author, categories, comments, source, content:encoded,
  cloud, image, textInput, skip schedules, timestamps, and metadata fields);
  the W3C RSS 2.0 conformance profile was reclassified accordingly.
- Production startup requires an explicit public `ORIGIN`.
- Feed and favicon DNS checks now cover the address used for the actual socket;
  favicon HTML reads have a size limit and follow the redirected page URL.
- Container publication is tied to checked release tags instead of every push
  to `main`.
