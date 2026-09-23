# Changelog

Notable user-facing and operator-facing changes are recorded here. Releases use
the format described in [the release policy](docs/RELEASING.md).

## [Unreleased]

### Added

- AGPLv3-or-later licensing and a configurable link to the deployed source.
- Self-hosting, release, and database migration policies.
- A standalone database migration command for local, container, and Nix installs.
- Public-address checks for feed and favicon fetches, including redirect targets.
- Anonymous registration budgets for attempts, daily additions, stored feeds,
  concurrent fetches, and web request bodies.

### Changed

- Production startup requires an explicit public `ORIGIN`.
- Feed and favicon DNS checks now cover the address used for the actual socket;
  favicon HTML reads have a size limit and follow the redirected page URL.
- Container publication is tied to checked release tags instead of every push
  to `main`.
