/**
 * Retints BotKit's own design-system stylesheet — a set of CSS custom
 * properties bundled with the package (`@fedify/botkit`'s `static/style.js`)
 * — to match rss2.pub's web UI tokens (`src/web/ui/styles.ts`'s `STYLE`),
 * so the BotKit-rendered `/@handle` actor pages read as the same product as
 * the rest of the site instead of BotKit's own default green theme.
 *
 * Values are duplicated rather than imported: `src/web` may depend on
 * `src/infrastructure`, never the reverse (AGENTS.md's dependency rule), so
 * there is no lower layer both could share them from. Keep these in sync by
 * hand with `src/web/ui/styles.ts`'s `:root` tokens.
 *
 * Derived tokens (`--bk-surface-2`, `--bk-faint`, `--bk-border-strong`,
 * `--bk-accent-soft`, `--bk-accent-line`) are left to BotKit's own
 * `color-mix()` formulas, which already reference the tokens overridden here
 * and so pick up both themes automatically — only literal, underived colors
 * need restating per theme.
 */
export const BOTKIT_THEME_CSS = `
  :root {
    --bk-font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    --bk-radius: 0.875rem;
    --bk-radius-sm: 0.625rem;
    --bk-radius-xs: 0.5rem;
    --bk-shadow: none;
    --bk-bg: #f5f5f7;
    --bk-surface: #ffffff;
    --bk-border: #e3e3e8;
    --bk-text: #16161a;
    --bk-muted: #52525c;
    --botkit-accent: #c2410c;
    --botkit-accent-contrast: #ffffff;
    --botkit-accent-ink: #c2410c;
    --botkit-accent-ink-dark: #fdba74;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bk-bg: #0b0b0e;
      --bk-surface: #141418;
      --bk-border: #2a2a31;
      --bk-text: #f0f0f3;
      --bk-muted: #a6a6b0;
      --botkit-accent: #fb923c;
      --botkit-accent-contrast: #1f1206;
    }
  }
  [data-theme="dark"] {
    --bk-bg: #0b0b0e;
    --bk-surface: #141418;
    --bk-border: #2a2a31;
    --bk-text: #f0f0f3;
    --bk-muted: #a6a6b0;
    --botkit-accent: #fb923c;
    --botkit-accent-contrast: #1f1206;
  }
`;
