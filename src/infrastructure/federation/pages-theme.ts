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
    --fed-space-2: 0.5rem;
    --fed-space-3: 0.75rem;
    --fed-space-4: 1rem;
    --fed-text-sm: 0.875rem;
    --fed-weight-medium: 500;
    --fed-tap: 2.75rem;
    --fed-bg: #f5f5f7;
    --fed-surface: #ffffff;
    --fed-surface-2: #f1f1f4;
    --fed-border: #e3e3e8;
    --fed-border-strong: #c4c4ce;
    --fed-text: #16161a;
    --fed-muted: #52525c;
    --fed-accent: #c2410c;
    --fed-accent-hover: #9a3412;
    --fed-accent-ink: #c2410c;
    --fed-accent-soft: #fff3ec;
    --fed-on-accent: #ffffff;
    --fed-focus: #16161a;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --fed-bg: #0b0b0e;
      --fed-surface: #141418;
      --fed-surface-2: #1d1d22;
      --fed-border: #2a2a31;
      --fed-border-strong: #3b3b44;
      --fed-text: #f0f0f3;
      --fed-muted: #a6a6b0;
      --fed-accent: #fb923c;
      --fed-accent-hover: #fdba74;
      --fed-accent-ink: #fdba74;
      --fed-accent-soft: #2a1a0e;
      --fed-on-accent: #1f1206;
      --fed-focus: #f0f0f3;
    }
  }
  [data-theme="dark"] {
    --fed-bg: #0b0b0e;
    --fed-surface: #141418;
    --fed-surface-2: #1d1d22;
    --fed-border: #2a2a31;
    --fed-border-strong: #3b3b44;
    --fed-text: #f0f0f3;
    --fed-muted: #a6a6b0;
    --fed-accent: #fb923c;
    --fed-accent-hover: #fdba74;
    --fed-accent-ink: #fdba74;
    --fed-accent-soft: #2a1a0e;
    --fed-on-accent: #1f1206;
    --fed-focus: #f0f0f3;
  }
`;
