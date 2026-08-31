/**
 * Theme tokens for first-party federation actor and message pages.
 *
 * Values are duplicated rather than imported: `src/web` may depend on
 * `src/infrastructure`, never the reverse (AGENTS.md's dependency rule), so
 * there is no lower layer both could share them from. Keep these in sync by
 * hand with `src/web/ui/styles.ts`'s `:root` tokens.
 */
export const FEDERATION_PAGE_THEME_CSS = `
  :root {
    --fed-font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    --fed-radius: 0.875rem;
    --fed-radius-sm: 0.625rem;
    --fed-bg: #f5f5f7;
    --fed-surface: #ffffff;
    --fed-border: #e3e3e8;
    --fed-text: #16161a;
    --fed-muted: #52525c;
    --fed-accent-ink: #c2410c;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --fed-bg: #0b0b0e;
      --fed-surface: #141418;
      --fed-border: #2a2a31;
      --fed-text: #f0f0f3;
      --fed-muted: #a6a6b0;
      --fed-accent-ink: #fdba74;
    }
  }
  [data-theme="dark"] {
    --fed-bg: #0b0b0e;
    --fed-surface: #141418;
    --fed-border: #2a2a31;
    --fed-text: #f0f0f3;
    --fed-muted: #a6a6b0;
    --fed-accent-ink: #fdba74;
  }
`;
