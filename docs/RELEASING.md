# Release policy

The first public release will be `v0.1.0`. Everything before that tag is
unreleased development history. The public release starts with a fresh database;
there is no supported import path from an earlier private installation.

## Versions and changes

- Use `vMAJOR.MINOR.PATCH` Git tags and matching versions in the root and all
  workspace `package.json` files. Keep the Nix version and NodeInfo version
  derived from the root package version.
- Before `1.0.0`, increment MINOR for incompatible changes and new features;
  increment PATCH for compatible fixes. From `1.0.0`, use MAJOR for incompatible
  changes, MINOR for compatible features, and PATCH for compatible fixes.
- Maintain `CHANGELOG.md` under `Unreleased` while developing. Before tagging,
  move shipped items to a dated `## [X.Y.Z] - YYYY-MM-DD` section. Include
  operator actions, configuration changes, and migration risks alongside
  user-facing changes. Explain breaking changes and their upgrade path.
- Update `docs/ko/changelog.md` for the same release, and update the Korean
  operator guides whenever their English instructions change. Build both
  locales with `yarn docs:build` before tagging.
- A release tag is immutable. If a release is faulty, publish a new version;
  never replace an existing tag or image version.

## Release checklist

1. Review dependencies, license notices, documentation, and the changes since
   the previous tag. Update all package versions and `CHANGELOG.md`.
2. Run `yarn install --immutable`, `yarn typecheck`, `yarn lint:solid`, and
   `yarn test`. Run the UI suite and Nix build when their inputs changed.
3. Check the release metadata with `yarn release:check vX.Y.Z`. Commit the
   version and changelog changes, then tag that exact commit `vX.Y.Z`.
4. The tag workflow runs the full CI workflow before publishing the container
   image as `ghcr.io/moreal/rss2pub:vX.Y.Z`. The `latest` tag follows only
   stable release tags. Verify the GHCR package is publicly readable. Operators
   should pin a version tag or digest.
5. Publish release notes from the matching changelog section. For any schema
   change, include the bundled `db:migrate` command, backup, and upgrade instructions from
   [the migration policy](DATABASE_MIGRATIONS.md).

Do not publish a tag while the quality gate is red. A successful container
build alone is not a release check.

Documentation deploys separately on `main` through GitHub Pages. For domain
setup and checks, see the [documentation deployment guide](DEPLOYMENT.md).
