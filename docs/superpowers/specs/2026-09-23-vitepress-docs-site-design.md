# VitePress documentation site design

## Purpose and scope

Publish usable, bilingual documentation for people who register feeds and for
operators who self-host rss2.pub. The public URL is `https://docs.rss2.pub/`.
GitHub Pages hosts static output built from this repository on pushes to `main`.
The application and documentation deploy independently.

The first version covers an introduction and quick start, self-hosting,
database migrations and upgrades, release policy, and the changelog. English
is the root locale; Korean is under `/ko/`. Both locales expose the same
navigation destinations and substantially the same instructions. Existing
English operator documents remain the canonical source for their topics. The
root `CHANGELOG.md` remains the canonical release record and is rendered on the
documentation site without maintaining a separate English copy.

## Site structure

- `docs/package.json`, `docs/yarn.lock`, and `docs/.yarnrc.yml` make the site an
  independent Yarn Berry project. It uses the repository's Node and Yarn
  versions but is outside the root workspace dependency graph.
- `docs/.vitepress/config.ts` configures the default VitePress theme, English
  and Korean locale navigation, sidebar, site title, metadata, local search,
  canonical host, and source/edit links.
- `docs/index.md` and `docs/ko/index.md` explain what rss2.pub does, accepted
  Atom 1.0 and RSS 2.0 formats, how to register a feed, and how to follow its
  actor. They direct operators to the self-hosting guide.
- The existing `docs/SELF_HOSTING.md`, `docs/DATABASE_MIGRATIONS.md`, and
  `docs/RELEASING.md` are published as English pages. Korean counterparts live
  under `docs/ko/` and use the same command examples and configuration names.
- `docs/changelog.md` renders the root changelog; `docs/ko/changelog.md`
  provides its Korean translation. A release checklist includes updating both
  locale navigation and the Korean changelog when a release is cut.
- Internal plans, specs, and ADRs stay in the repository, but are excluded
  from the documentation site's page source and primary navigation. They can
  still be read on GitHub.

VitePress route rewrites provide lowercase public paths for existing uppercase
operator document filenames. Use clean URLs only if the Pages output is
verified to serve them correctly. Broken internal links fail the docs build.

## Build and deployment

Pin VitePress in the independent `docs/` Yarn project and expose `docs:dev`,
`docs:build`, and `docs:preview` scripts at the root as wrappers. Ignore
generated VitePress cache and output. The root `yarn.lock` and its Nix offline
cache hash do not change when only documentation dependencies change. Keep the
docs build out of the application Docker and Nix runtime package. CI runs the
docs build on changes, and a separate
GitHub Actions workflow publishes its static output to GitHub Pages from
`main`. The deployment job has only the GitHub Pages and OIDC permissions it
needs. The custom domain has the root base path `/`.

Verify `rss2.pub` on the `moreal` GitHub account with GitHub's requested TXT
record. Then enable GitHub Pages with GitHub Actions as its source and set its
custom domain to `docs.rss2.pub`. Only after the Pages site is configured, make
`docs.rss2.pub` a CNAME to `moreal.github.io` in DNS and enable HTTPS when
GitHub offers it. No application reverse proxy, database, or homelab
service participates in documentation hosting. DNS and GitHub settings are
external deployment steps; the repository documents the exact sequence.

## Verification and release behavior

The local acceptance check runs `yarn docs:build`, checks generated English and
Korean pages and the changelog, and verifies the Pages workflow and domain
instructions. The repository quality gate remains green. A documentation
change may deploy from `main` without tagging an application release; a tagged
release updates the root changelog and its Korean site translation together.

Do not claim `docs.rss2.pub` is live until GitHub Pages reports deployment,
the DNS record resolves correctly, and HTTPS serves both locales. If those
external steps cannot be completed in this session, report the exact remaining
step and leave the repository build ready to deploy.
