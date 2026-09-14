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

    /* Fixed, not themed — mirrors --avatar-plate in src/web/ui/styles.ts
       (same value, kept in sync by hand per this file's header comment).
       Painted on .avatar img itself, not the chip's own background: a
       feed's icon is drawn for an unknown host page and must stay legible
       whichever way this page's own theme falls (a light plate keeps only
       the common case — an icon drawn for a light host page — legible; one
       drawn only for dark chrome trades away visibility either way). The
       new no-icon fallback glyph this diff adds is first-party art, drawn
       in this page's own --fed-surface-2 / --fed-accent-ink rather than a
       fixed pair: it is not the same colour as the web UI's equivalent
       glyph (styles.ts uses the decorative --brand there; this page has no
       equivalent token), so "mirrors" above refers to the plate mechanism
       only, not a pixel-identical rendering. */
    --fed-avatar-plate: #ffffff;
    /* Mirrors --image-outline in src/web/ui/styles.ts; must stay pure black/white alpha. */
    --fed-image-outline: oklch(0 0 0 / 0.1);
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --fed-bg: #0b0b0e;
      --fed-surface: #141418;
      --fed-surface-2: #1d1d22;
      --fed-border: #2a2a31;
      --fed-image-outline: oklch(1 0 0 / 0.1);
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
    --fed-image-outline: oklch(1 0 0 / 0.1);
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
