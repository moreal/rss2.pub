/**
 * Retints BotKit's own design-system stylesheet — a set of CSS custom
 * properties bundled with the package (`@fedify/botkit`'s `static/style.js`)
 * — to match rss2.pub's web UI tokens (`src/web/ui/layout.tsx`'s `STYLE`),
 * so the BotKit-rendered `/@handle` actor pages read as the same product as
 * the rest of the site instead of BotKit's own default green theme.
 *
 * Values are duplicated rather than imported: `src/web` may depend on
 * `src/infrastructure`, never the reverse (AGENTS.md's dependency rule), so
 * there is no lower layer both could share them from. Keep these in sync by
 * hand with `src/web/ui/layout.tsx`'s `:root` tokens.
 *
 * Derived tokens (`--bk-surface-2`, `--bk-faint`, `--bk-border-strong`,
 * `--bk-accent-soft`, `--bk-accent-line`) are left to BotKit's own
 * `color-mix()` formulas, which already reference the tokens overridden here
 * and so pick up both themes automatically — only literal, underived colors
 * need restating per theme.
 */
export const BOTKIT_THEME_CSS = `
  :root {
    --bk-font: system-ui, -apple-system, "Segoe UI", sans-serif;
    --bk-radius: 0.875rem;
    --bk-radius-sm: 0.625rem;
    --bk-radius-xs: 0.5rem;
    --bk-shadow: none;
    --bk-bg: #f4f4f6;
    --bk-surface: #ffffff;
    --bk-border: rgb(19 19 22 / 10%);
    --bk-text: #131316;
    --bk-muted: #6c6c76;
    --botkit-accent: #ea580c;
    --botkit-accent-contrast: #ffffff;
    --botkit-accent-ink: #ea580c;
    --botkit-accent-ink-dark: #fb923c;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bk-bg: #0a0a0c;
      --bk-surface: #141417;
      --bk-border: rgb(255 255 255 / 11%);
      --bk-text: #f2f2f4;
      --bk-muted: #96969f;
      --botkit-accent: #fb923c;
      --botkit-accent-contrast: #1a0f04;
    }
  }
  [data-theme="dark"] {
    --bk-bg: #0a0a0c;
    --bk-surface: #141417;
    --bk-border: rgb(255 255 255 / 11%);
    --bk-text: #f2f2f4;
    --bk-muted: #96969f;
    --botkit-accent: #fb923c;
    --botkit-accent-contrast: #1a0f04;
  }
`;
