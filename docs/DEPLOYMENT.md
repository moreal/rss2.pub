# Documentation deployment

The documentation is a separate VitePress project in `docs/`. GitHub Actions
builds and deploys it to GitHub Pages after a change to the docs or root
changelog reaches `main`. It does not use the application container, Nix
package, PostgreSQL, or the homelab reverse proxy.

## Local checks

Use Node.js 24 and Yarn Berry 4.17.1. The docs have their own lockfile:

```sh
corepack yarn --cwd docs install --immutable
corepack yarn --cwd docs build
corepack yarn --cwd docs dev
```

The output is `docs/.vitepress/dist`. CI builds the site on pull requests and
pushes to `main`; only `.github/workflows/docs.yml` deploys it.

## Connect docs.rss2.pub

1. In the `moreal` GitHub account's Pages settings, verify ownership of
   `rss2.pub` with the TXT record GitHub gives you. Keep that TXT record in
   Cloudflare after verification. This protects its direct subdomains from
   Pages takeover.
2. In this repository's **Settings → Pages**, select **GitHub Actions** as
   the publishing source and set the custom domain to `docs.rss2.pub`.
3. Only after GitHub binds that domain to this repository, create the
   Cloudflare record `CNAME docs → moreal.github.io` in **DNS only** mode.
   Do not point it at the repository path or at `rss2.pub`. Avoid wildcard
   DNS records for this domain.
4. Run the documentation workflow on `main` if it has not already run. Wait
   for GitHub to issue the certificate, then select **Enforce HTTPS** in
   Pages settings.
5. Verify that the workflow succeeds, DNS resolves to `moreal.github.io`,
   `https://docs.rss2.pub/` and `https://docs.rss2.pub/ko/` both load, and
   each language's self-hosting and changelog pages work.

The GitHub Actions publishing mode does not need a checked-in `CNAME` file.
GitHub Pages and DNS changes can take time to converge; do not announce the
domain as live until HTTPS and both locales have been checked. See
[GitHub's custom-domain instructions](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
for current Pages behavior.
