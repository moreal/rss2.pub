import { defineConfig } from "vitepress";

export default defineConfig({
  title: "rss2.pub",
  description: "Turn Atom 1.0 and RSS 2.0 feeds into followable fediverse accounts.",
  base: "/",
  sitemap: { hostname: "https://docs.rss2.pub/" },
  cleanUrls: true,
  rewrites: {
    "SELF_HOSTING.md": "self-hosting.md",
    "DATABASE_MIGRATIONS.md": "database-migrations.md",
    "RELEASING.md": "releasing.md",
    "ko/SELF_HOSTING.md": "ko/self-hosting.md",
    "ko/DATABASE_MIGRATIONS.md": "ko/database-migrations.md",
    "ko/RELEASING.md": "ko/releasing.md",
  },
  srcExclude: ["adr/**", "superpowers/**", "design/**", "PLAN.md"],
  locales: {
    root: {
      label: "English",
      lang: "en-US",
      themeConfig: {
        nav: [
          { text: "Guide", link: "/" },
          { text: "Self-hosting", link: "/self-hosting" },
          { text: "Changelog", link: "/changelog" },
        ],
        sidebar: [
          { text: "Get started", items: [{ text: "Overview", link: "/" }] },
          {
            text: "Operate",
            items: [
              { text: "Self-hosting", link: "/self-hosting" },
              { text: "Database migrations", link: "/database-migrations" },
              { text: "Release policy", link: "/releasing" },
              { text: "Changelog", link: "/changelog" },
            ],
          },
        ],
      },
    },
    ko: {
      label: "한국어",
      lang: "ko-KR",
      themeConfig: {
        nav: [
          { text: "시작하기", link: "/ko/" },
          { text: "자가 호스팅", link: "/ko/self-hosting" },
          { text: "변경 기록", link: "/ko/changelog" },
        ],
        sidebar: [
          { text: "시작하기", items: [{ text: "개요", link: "/ko/" }] },
          {
            text: "운영",
            items: [
              { text: "자가 호스팅", link: "/ko/self-hosting" },
              { text: "DB 마이그레이션", link: "/ko/database-migrations" },
              { text: "릴리스", link: "/ko/releasing" },
              { text: "변경 기록", link: "/ko/changelog" },
            ],
          },
        ],
      },
    },
  },
  themeConfig: {
    search: { provider: "local" },
    editLink: {
      pattern: "https://github.com/moreal/rss2.pub/edit/main/docs/:path",
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/moreal/rss2.pub" },
    ],
  },
});
