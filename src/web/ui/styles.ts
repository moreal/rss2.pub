/**
 * The whole design system, as one stylesheet inlined into every page.
 *
 * Three rules keep it a system rather than a pile of declarations:
 *
 * 1. **Only tokens below name a raw value.** Component rules reference
 *    `var(--…)`; a page never invents a colour, a radius, or a spacing step.
 * 2. **Colours are semantic roles**, not hues — `--text-muted`, `--danger`,
 *    `--accent-ink`. Dark mode redefines the same roles, so every component
 *    themes itself for free.
 * 3. **Text colours are picked for contrast, not for brand.** The brand
 *    orange (`--brand`) is only ever a large decorative mark; text and fills
 *    use `--accent` / `--accent-ink`, which clear WCAG 2.2 AA (4.5:1) on the
 *    surfaces they are allowed on. A unit test pins the pairs that matter.
 *
 * Emitted through `raw()` (see layout.tsx): Hono escapes `"`, `<`, `>` and
 * `&` in text children, which would silently corrupt quoted font names and
 * child selectors.
 */
export const STYLE = `
  :root {
    color-scheme: light dark;

    /* Spacing — one 4px-based scale. Gaps express relatedness: --space-2
       inside a control, --space-4 between fields, --space-6 between sections. */
    --space-1: 0.25rem;
    --space-2: 0.5rem;
    --space-3: 0.75rem;
    --space-4: 1rem;
    --space-5: 1.5rem;
    --space-6: 2rem;
    --space-7: 3rem;

    /* Type scale. Hierarchy comes from weight and spacing as much as size,
       so the steps stay small and nothing shouts. */
    --text-xs: 0.8125rem;
    --text-sm: 0.875rem;
    --text-base: 1rem;
    --text-lg: 1.0625rem;
    --text-xl: 1.25rem;
    --text-2xl: clamp(1.5rem, 1.15rem + 1.6vw, 2rem);
    --leading-tight: 1.2;
    --leading-normal: 1.6;
    --weight-medium: 500;
    --weight-semibold: 600;
    --weight-bold: 700;
    --font-sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;

    /* Colour roles — light theme. */
    --bg: #f5f5f7;
    --surface: #ffffff;
    --surface-2: #f1f1f4;
    --text: #16161a;
    --text-muted: #52525c;
    --text-subtle: #64646f;
    --border: #e3e3e8;
    --border-strong: #c4c4ce;
    --brand: #ea580c;
    --accent: #c2410c;
    --accent-hover: #9a3412;
    --accent-ink: #c2410c;
    --accent-soft: #fff3ec;
    --on-accent: #ffffff;
    --danger: #b3261e;
    --danger-bg: #fdf1f0;
    --danger-border: #f0c8c4;
    --success: #1c6b3f;
    --success-bg: #eef7f1;
    --success-border: #bfdfcb;
    --on-success: #ffffff;
    --focus: #16161a;

    --radius-xs: 0.375rem;
    --radius-sm: 0.5rem;
    --radius-md: 0.625rem;
    --radius-lg: 0.875rem;

    /* One reading column for the whole product, and one minimum tap size. */
    --container: 46rem;
    --tap: 2.75rem;

    --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
    --dur-fast: 120ms;
    --dur-base: 200ms;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0b0b0e;
      --surface: #141418;
      --surface-2: #1d1d22;
      --text: #f0f0f3;
      --text-muted: #a6a6b0;
      --text-subtle: #8c8c97;
      --border: #2a2a31;
      --border-strong: #3b3b44;
      --brand: #fb923c;
      --accent: #fb923c;
      --accent-hover: #fdba74;
      --accent-ink: #fdba74;
      --accent-soft: #2a1a0e;
      --on-accent: #1f1206;
      --danger: #f87171;
      --danger-bg: #2a1516;
      --danger-border: #57282a;
      --success: #4ade80;
      --success-bg: #10241a;
      --success-border: #2f5340;
      --on-success: #0b0b0e;
      --focus: #f0f0f3;
    }
  }

  /* ---------- base ---------- */

  *, *::before, *::after { box-sizing: border-box; }

  html {
    min-height: 100%;
    background: var(--bg);
    -webkit-text-size-adjust: 100%;
  }

  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    font-family: var(--font-sans);
    font-size: var(--text-base);
    line-height: var(--leading-normal);
    color: var(--text);
    background: var(--bg);
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  h1, h2, h3, p, ul, ol, figure { margin: 0; }
  ul, ol { padding: 0; }
  h1, h2, h3 { line-height: var(--leading-tight); text-wrap: balance; }
  p { text-wrap: pretty; }
  /* Korean has no spaces inside an eojeol, so the default break-anywhere
     behaviour splits words mid-token. Only CJK text is affected. */
  :lang(ko) h1, :lang(ko) h2, :lang(ko) h3, :lang(ko) p, :lang(ko) label {
    word-break: keep-all;
  }
  svg { display: block; }

  /* An author-origin display on a component class outranks the UA's rule
     for the hidden attribute, so a progressively-enhanced control would ship
     visible and dead. This restores the attribute's meaning. */
  [hidden] { display: none !important; }

  a { color: var(--accent-ink); text-underline-offset: 0.16em; }
  a:hover { color: var(--accent-hover); }
  a, button, input, label, summary {
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  /* One focus style for everything, always visible, never removed. */
  :focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  .sr-only {
    position: absolute; width: 1px; height: 1px;
    padding: 0; margin: -1px; overflow: hidden;
    clip-path: inset(50%); white-space: nowrap; border: 0;
  }

  /* Keyboard users land here first; it stays off-screen until focused. */
  .skip {
    position: absolute; z-index: 20;
    top: var(--space-2); left: var(--space-2);
    transform: translateY(-250%);
    padding: var(--space-2) var(--space-3);
    background: var(--surface); color: var(--text);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    font-size: var(--text-sm); font-weight: var(--weight-medium);
    text-decoration: none;
  }
  .skip:focus { transform: translateY(0); }

  /* ---------- page shell ---------- */

  .shell {
    width: 100%;
    max-width: var(--container);
    margin-inline: auto;
    padding-left: max(var(--space-4), env(safe-area-inset-left));
    padding-right: max(var(--space-4), env(safe-area-inset-right));
  }

  header.site {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }

  .site-inner {
    display: flex;
    align-items: center;
    gap: var(--space-2) var(--space-4);
    flex-wrap: wrap;
    padding-block: var(--space-2);
  }

  .brand {
    display: inline-flex; align-items: center; gap: var(--space-2);
    min-height: var(--tap);
    color: var(--text); text-decoration: none;
    font-size: var(--text-lg); font-weight: var(--weight-bold);
    letter-spacing: -0.02em;
  }
  .brand:hover { color: var(--text); }
  .brand:hover .brand-name { text-decoration: underline; }
  .brand-mark { width: 1.25rem; height: 1.25rem; color: var(--brand); flex: none; }

  nav.site-nav, nav.lang { display: flex; align-items: center; gap: var(--space-1); }

  nav.site-nav a, nav.lang a, nav.lang span {
    display: inline-flex; align-items: center;
    min-height: var(--tap); padding-inline: var(--space-3);
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
    text-decoration: none;
  }
  nav.site-nav a, nav.lang a { color: var(--text-muted); }
  nav.site-nav a:hover, nav.lang a:hover {
    color: var(--text); background: var(--surface-2);
  }
  /* Current page marked by weight and fill, not by colour alone. */
  nav.site-nav a[aria-current], nav.lang [aria-current] {
    color: var(--text); background: var(--surface-2);
    font-weight: var(--weight-semibold);
  }
  /* Two clusters, not one row of six equivalent chips: where you can go sits
     with the brand at the start of the line, and the setting that changes how
     the page reads is pushed to the far end. The distance is the separator —
     a rule between them spent more ink saying the same thing, and floated
     free of anything it divided as soon as the header wrapped. Wrapped, this
     margin is what still holds the language links against the right edge
     instead of stranding them under the brand. */
  nav.lang { margin-inline-start: auto; }
  nav.lang a, nav.lang span { padding-inline: var(--space-2); }

  main.shell {
    flex: 1;
    display: grid;
    align-content: start;
    gap: var(--space-6);
    padding-top: var(--space-6);
    padding-bottom: var(--space-7);
  }

  footer.site-footer {
    margin-top: auto;
    background: var(--surface);
    border-top: 1px solid var(--border);
  }
  .footer-inner {
    display: grid; gap: var(--space-2);
    padding-block: var(--space-5);
    font-size: var(--text-sm); color: var(--text-muted);
  }
  .footer-links {
    display: flex; flex-wrap: wrap;
    gap: var(--space-1) var(--space-4);
  }
  /* inline-flex with a 1.5rem floor keeps every footer link at the 24px
     minimum target size, which "Source code" — a link with no sentence
     around it to claim the inline exemption — missed by two pixels. */
  .footer-links a {
    display: inline-flex; align-items: center; min-height: 1.5rem;
    color: var(--text-muted);
  }
  .footer-links a:hover { color: var(--accent-hover); }

  /* ---------- typography blocks ---------- */

  .page-head { display: grid; gap: var(--space-3); }
  h1 {
    font-size: var(--text-2xl);
    font-weight: var(--weight-bold);
    letter-spacing: -0.025em;
  }
  h2 {
    font-size: var(--text-xl);
    font-weight: var(--weight-semibold);
    letter-spacing: -0.015em;
  }
  h3 { font-size: var(--text-lg); font-weight: var(--weight-semibold); }
  /* Long prose is capped well short of the container so lines stay readable. */
  .lede { color: var(--text-muted); max-width: 58ch; }
  .prose { max-width: 62ch; }
  .help { font-size: var(--text-sm); color: var(--text-muted); max-width: 62ch; }
  .quiet { color: var(--text-muted); }

  .chip, code.chip {
    font-family: var(--font-mono); font-size: 0.9em;
    padding: 0.1em 0.35em;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-xs);
    overflow-wrap: anywhere;
  }

  /* ---------- surfaces ---------- */

  .panel {
    display: grid; gap: var(--space-4);
    padding: var(--space-5);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
  }
  .panel-head { display: grid; gap: var(--space-1); }

  .section-head {
    display: flex; align-items: center; justify-content: space-between;
    gap: var(--space-3) var(--space-4); flex-wrap: wrap;
  }

  /* ---------- forms ---------- */

  .field { display: grid; gap: var(--space-2); }
  .field-label {
    font-size: var(--text-sm); font-weight: var(--weight-medium);
    color: var(--text);
  }
  .control { display: flex; gap: var(--space-2); flex-wrap: wrap; }

  input[type="url"], input[type="search"], input[type="text"] {
    flex: 1 1 12rem; min-width: 0; min-height: var(--tap);
    padding: var(--space-2) var(--space-3);
    font: inherit; font-size: var(--text-base);
    color: var(--text); background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    appearance: none; -webkit-appearance: none;
    transition: border-color var(--dur-fast) ease,
      box-shadow var(--dur-fast) ease;
  }
  input::placeholder { color: var(--text-subtle); }
  input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
  input[aria-invalid="true"] { border-color: var(--danger); }
  input[aria-invalid="true"]:focus { box-shadow: 0 0 0 3px var(--danger-bg); }
  @media (hover: hover) and (pointer: fine) {
    input[type="url"]:hover, input[type="search"]:hover, input[type="text"]:hover {
      border-color: var(--text-subtle);
    }
  }

  .btn {
    display: inline-flex; align-items: center; justify-content: center;
    gap: var(--space-2);
    min-height: var(--tap); padding-inline: var(--space-4);
    font: inherit; font-size: var(--text-base);
    font-weight: var(--weight-medium);
    border: 1px solid transparent; border-radius: var(--radius-md);
    text-decoration: none; white-space: nowrap; cursor: pointer;
    transition: background-color var(--dur-fast) ease,
      border-color var(--dur-fast) ease,
      transform var(--dur-base) var(--ease-out);
  }
  .btn-primary { background: var(--accent); color: var(--on-accent); }
  .btn-primary:hover { background: var(--accent-hover); color: var(--on-accent); }
  .btn-secondary {
    background: var(--surface); color: var(--text);
    border-color: var(--border-strong);
  }
  .btn-secondary:hover { background: var(--surface-2); color: var(--text); }
  /* Third tier, for an action that is a way out rather than a next step —
     it needs the button's tap target but none of its emphasis. */
  .btn-quiet { background: transparent; color: var(--text-muted); }
  .btn-quiet:hover { background: var(--surface-2); color: var(--text); }
  .btn-sm { min-height: 2.25rem; font-size: var(--text-sm); padding-inline: var(--space-3); }
  .btn-icon { width: var(--tap); padding-inline: 0; flex: none; }
  .btn:active { transform: scale(0.98); }
  .btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

  /* Registering fetches the feed over the network, which takes seconds the
     user has no other evidence of: before this the page simply sat there and
     invited a second click. The button keeps the width it had — a relabel
     that resizes the control mid-press is its own small betrayal — and says
     what is happening in words as well as in the ring, because a spinner
     alone is not a message. aria-disabled rather than disabled: a disabled
     button drops out of the tab order and stops being announced, and the
     submit handler is what actually blocks the second submission. */
  .btn[data-pending] { cursor: progress; }
  .btn[data-pending] .btn-spinner { display: block; }
  .btn-spinner {
    display: none; flex: none;
    width: 0.9em; height: 0.9em;
    border: 2px solid currentColor; border-top-color: transparent;
    border-radius: 999px;
    animation: spin 700ms linear infinite;
  }

  /* Checkbox: title and explanation are both part of the label, so the whole
     block is one hit target and one accessible name. */
  .check {
    display: grid; grid-template-columns: auto 1fr;
    gap: var(--space-1) var(--space-3);
    align-items: start;
    padding: var(--space-3);
    margin-inline: calc(var(--space-3) * -1);
    border-radius: var(--radius-md);
    cursor: pointer;
  }
  .check input {
    grid-row: span 2;
    width: 1.25rem; height: 1.25rem; margin: 0.15rem 0 0;
    accent-color: var(--accent); flex: none;
  }
  .check-title { font-size: var(--text-sm); font-weight: var(--weight-medium); }
  .check-help { grid-column: 2; font-size: var(--text-sm); color: var(--text-muted); }
  @media (hover: hover) and (pointer: fine) {
    .check:hover { background: var(--surface-2); }
  }
  .check:focus-within { background: var(--surface-2); }

  .form-actions { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: center; }
  @media (max-width: 30rem) {
    .form-actions .btn { width: 100%; }
  }

  /* Compact search sits beside a heading; it must never crush its own
     placeholder, so it keeps a floor of 13rem, and its icon button stays on
     the input's row at every width. */
  form.search-compact { flex: 1 1 13rem; max-width: 20rem; flex-wrap: nowrap; }
  @media (max-width: 34rem) {
    form.search-compact { max-width: none; flex-basis: 100%; }
  }

  /* A note that belongs to the panel but not to the form above it. */
  .panel-note {
    padding-top: var(--space-4);
    border-top: 1px solid var(--border);
  }

  /* ---------- feed list ---------- */

  ul.feeds { list-style: none; display: grid; }
  /* A grid item's automatic minimum is its content's min-content width, and
     the clipped identifiers below are deliberately unbreakable — without
     this the widest handle in the list would widen the whole column and push
     the page into horizontal overflow instead of being ellipsised. */
  ul.feeds li { min-width: 0; }
  ul.feeds li + li { border-top: 1px solid var(--border); }
  /* The way out of a list that is only a teaser, rendered at all only when
     the data says something was left out. It keeps a button's tap target but
     wears a link's underline and colour, because that is what it is: quiet
     weight alone left it looking like a caption nobody could tell was
     clickable. justify-self keeps it to its own width inside the panel's
     grid instead of stretching into a full-width bar. */
  .section-more {
    justify-self: start;
    color: var(--accent-ink);
    text-decoration: underline;
    text-underline-offset: 0.16em;
  }
  .section-more:hover { color: var(--accent-hover); }

  .feed {
    position: relative;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--space-1) var(--space-3);
    align-items: start;
    padding: var(--space-4) var(--space-3);
    margin-inline: calc(var(--space-3) * -1);
    border-radius: var(--radius-md);
    transition: background-color var(--dur-fast) ease;
  }
  @media (hover: hover) and (pointer: fine) {
    .feed:hover { background: var(--surface-2); }
  }
  /* The whole row is the click target, so the whole row is what the focus
     ring should draw around. The title link inside it would otherwise add a
     second, tighter rectangle — two nested rings for one target. Dropping
     the inner one is gated on :has() actually being supported, so a browser
     without it keeps the link's own ring rather than no ring at all. */
  .feed:has(a:focus-visible) {
    outline: 2px solid var(--focus);
    outline-offset: -1px;
  }
  @supports selector(:has(*)) {
    .feed-title a:focus-visible { outline: none; }
  }
  .feed-body { grid-column: 2; display: grid; gap: var(--space-1); min-width: 0; }
  .feed-title { font-size: var(--text-lg); font-weight: var(--weight-semibold); }
  /* A feed's title and description are written by the feed, so their language
     is independent of the page's — the :lang(ko) rule above cannot reach a
     Korean feed listed on an English page, and CJK then breaks mid-word.
     keep-all stops that. It also outranks overflow-wrap: break-word, which
     then leaves an unbreakable Latin token — a bare domain standing in for a
     missing title — to overflow the card; only "anywhere" both breaks that
     token and shrinks the grid column's min-content width to match. */
  .feed-title, .feed-desc { word-break: keep-all; overflow-wrap: anywhere; }
  .feed-title a { color: var(--text); text-decoration: none; }
  .feed-title a:hover { color: var(--text); text-decoration: underline; }
  /* The title's link covers the row, so the accessible name stays the feed
     name instead of the whole card's text. */
  .feed-title a::after { content: ""; position: absolute; inset: 0; }
  .feed-desc {
    color: var(--text-muted); font-size: var(--text-sm);
    display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2;
    -webkit-box-orient: vertical; overflow: hidden;
  }
  /* One row for everything that is *about* the feed rather than its name.
     The items are told apart by weight and family, not by a separator glyph:
     a "·" drawn on the source URL ended up orphaned at the start of a line
     every time the handle above it filled its own, which is most of the time
     on a phone. A --space-3 gap does the same job and never wraps alone. */
  .feed-meta {
    display: flex; flex-wrap: wrap; align-items: baseline;
    min-width: 0;
    gap: var(--space-1) var(--space-3);
    margin-top: var(--space-1);
    font-size: var(--text-xs); color: var(--text-subtle);
  }
  /* The count is the reason the list is in this order, so it leads the row
     and carries slightly more weight than the identifiers behind it. It used
     to sit in a column of its own at the far right of the card, a headline's
     width away from the feed it counted — and last of all on a phone. */
  .feed-stat {
    color: var(--text-muted); font-weight: var(--weight-medium);
    font-variant-numeric: tabular-nums; white-space: nowrap;
  }
  /* Quiet on purpose. Recognising the feed is this list's job, and the
     handle is needed exactly once — when following — where the result page
     gives it a copy button. In accent orange it out-shouted every title on
     the page. Lifted above the row-covering link so it stays selectable.

     overflow-wrap must stay "anywhere" here: only that value shrinks the
     item's min-content width, and a handle on a long host is wider than a
     375px screen. The gentler "break-word" refuses to shrink and pushes the
     whole card into horizontal overflow — measured, not theoretical.
     (No backticks in this file: it is one template literal.) */
  .handle {
    position: relative; z-index: 1;
    font-family: var(--font-mono);
  }
  /* Both identifiers are longer than a phone is wide, and both are secondary
     to the name above them. Wrapping them cost three lines per card and broke
     a handle across "…@rss2.p / ub"; a single clipped line keeps the prefix —
     the part that identifies — and keeps every card the same shape. The full
     value is one tap away on the account page, and in the title tooltip.
     min-width: 0 is what actually permits the shrink: a flex item defaults to
     min-width: auto and would otherwise force the row wider than the screen. */
  .handle, .feed-src {
    min-width: 0; max-width: 100%;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  .avatar {
    position: relative; flex: none; overflow: hidden;
    width: 2.25rem; height: 2.25rem;
    display: grid; place-items: center;
    border: 1px solid var(--border); border-radius: var(--radius-sm);
    background: var(--surface-2); color: var(--brand);
  }
  .avatar svg { width: 1.1rem; height: 1.1rem; }
  .avatar img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }

  .tag {
    display: inline-flex; align-items: center;
    padding: 0.05rem var(--space-2);
    border: 1px solid var(--border-strong); border-radius: var(--radius-xs);
    font-size: var(--text-xs); color: var(--text-muted);
    background: var(--surface);
  }
  .tag-accent {
    color: var(--accent-ink);
    background: var(--accent-soft);
    border-color: color-mix(in srgb, var(--accent) 30%, var(--border));
  }

  /* ---------- feedback ---------- */

  .notice {
    display: grid; grid-template-columns: auto minmax(0, 1fr);
    gap: var(--space-3);
    padding: var(--space-4);
    border: 1px solid var(--border); border-radius: var(--radius-md);
    background: var(--surface-2);
  }
  .notice-icon { flex: none; margin-top: 0.15rem; color: var(--text-muted); }
  .notice-body { display: grid; gap: var(--space-2); min-width: 0; }
  .notice-title { font-weight: var(--weight-semibold); }
  .notice-success { background: var(--success-bg); border-color: var(--success-border); }
  .notice-success .notice-icon, .notice-success .notice-title { color: var(--success); }
  .notice-error { background: var(--danger-bg); border-color: var(--danger-border); }
  .notice-error .notice-icon, .notice-error .notice-title { color: var(--danger); }

  /* Dashed edge distinguishes "nothing here yet" from a filled surface
     without relying on colour. */
  .empty-state {
    display: grid; justify-items: start; gap: var(--space-3);
    padding: var(--space-6) var(--space-4);
    border: 1px dashed var(--border-strong); border-radius: var(--radius-md);
    background: var(--surface-2);
  }
  .empty-title { font-weight: var(--weight-semibold); }

  ol.steps {
    list-style: none;
    display: grid; gap: var(--space-4);
    counter-reset: step;
  }
  ol.steps li {
    display: grid; grid-template-columns: auto minmax(0, 1fr);
    gap: var(--space-1) var(--space-3);
    align-items: start;
  }
  ol.steps li::before {
    counter-increment: step; content: counter(step);
    grid-row: span 2;
    width: 1.5rem; height: 1.5rem;
    display: grid; place-items: center;
    border-radius: 999px;
    background: var(--accent-soft); color: var(--accent-ink);
    border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--border));
    font-size: var(--text-xs); font-weight: var(--weight-semibold);
    font-variant-numeric: tabular-nums;
  }
  ol.steps .step-body { display: grid; gap: var(--space-2); min-width: 0; }

  /* One click selects the whole handle even when clipboard access is absent.
     The box is given the button's height so the two read as one control. */
  .copy-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
  .handle-value {
    display: inline-flex; align-items: center;
    /* Shrinks to 20rem before it gives up and pushes the button onto its own
       line, so a long handle wraps inside the box instead of separating the
       value from the control that copies it. */
    flex: 1 1 20rem; min-width: 0;
    min-height: var(--tap);
    font-family: var(--font-mono); font-size: var(--text-sm);
    padding: var(--space-2) var(--space-3);
    background: var(--surface); border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    overflow-wrap: anywhere; user-select: all;
  }
  .copy-btn { flex: none; }
  .copy-btn .icon-copied { display: none; }
  .copy-btn[data-copied] .icon-copied { display: block; }
  .copy-btn[data-copied] .icon-copy { display: none; }
  /* Confirmation swaps the whole fill rather than just the text colour: the
     button is primary now, and green-on-orange would be unreadable. The tick
     icon and the relabelled text carry the same news without the colour. */
  .copy-btn[data-copied] {
    background: var(--success); border-color: var(--success);
    color: var(--on-success);
  }

  /* ---------- motion ---------- */

  @media (prefers-reduced-motion: no-preference) {
    main .page-head, main .panel {
      animation: enter 260ms var(--ease-out) both;
    }
    main .panel { animation-delay: 40ms; }
  }
  @keyframes enter {
    from { opacity: 0; transform: translateY(0.4rem); }
    to { opacity: 1; transform: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    main .page-head, main .panel { animation: fade-in 140ms ease both; }
    .btn:active { transform: none; }
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  /* Under prefers-reduced-motion the block above freezes this to a single
     0.01ms turn, leaving a static broken ring — still a recognisable busy
     mark, and the relabelled button carries the meaning either way. */
  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @view-transition { navigation: auto; }
  header.site { view-transition-name: site-header; }
  ::view-transition-old(root), ::view-transition-new(root) {
    animation-duration: 160ms;
    animation-timing-function: var(--ease-out);
  }
  @media (prefers-reduced-motion: reduce) {
    ::view-transition-group(*),
    ::view-transition-old(*),
    ::view-transition-new(*) { animation: none !important; }
  }
`;

/**
 * Progressive enhancement for a submission that has to wait on the network.
 * Without JavaScript the form still submits and the browser's own progress
 * indicator is the only feedback; with it, the button reports that the work
 * started, and a second submit — the reflex when nothing appears to happen —
 * is swallowed instead of registering the feed twice.
 */
export const PENDING_SCRIPT = `
(function () {
  var forms = document.querySelectorAll("[data-pending-form]");
  Array.prototype.forEach.call(forms, function (form) {
    var button = form.querySelector("[data-pending-label]");
    if (!button) return;
    var label = button.querySelector("[data-btn-label]");
    var status = form.querySelector("[data-pending-status]");
    form.addEventListener("submit", function (event) {
      if (button.hasAttribute("data-pending")) {
        event.preventDefault();
        return;
      }
      var pending = button.getAttribute("data-pending-label");
      button.style.minWidth = button.getBoundingClientRect().width + "px";
      button.setAttribute("data-pending", "");
      button.setAttribute("aria-disabled", "true");
      if (label) label.textContent = pending;
      if (status) status.textContent = pending;
    });
  });
  // Coming back to this page through the history cache restores the frozen
  // DOM — spinner still turning, submit still blocked. Reload it instead.
  window.addEventListener("pageshow", function (event) {
    if (event.persisted) window.location.reload();
  });
})();
`;

/**
 * Progressive enhancement for the "copy the account name" button, which is
 * the one action a fresh registration is for. The button ships `hidden` and
 * is only revealed where the Clipboard API actually exists (it is absent on
 * insecure origins), so a browser that cannot copy never shows a dead
 * control — the handle stays selectable in either case.
 */
export const COPY_SCRIPT = `
(function () {
  if (!navigator.clipboard) return;
  var buttons = document.querySelectorAll("[data-copy]");
  var status = document.querySelector("[data-copy-status]");
  Array.prototype.forEach.call(buttons, function (button) {
    var label = button.querySelector("[data-copy-label]");
    button.hidden = false;
    button.addEventListener("click", function () {
      navigator.clipboard.writeText(button.getAttribute("data-copy")).then(
        function () {
          var done = button.getAttribute("data-copied-label");
          button.setAttribute("data-copied", "");
          if (label) label.textContent = done;
          if (status) status.textContent = done;
          setTimeout(function () {
            button.removeAttribute("data-copied");
            if (label) label.textContent = label.getAttribute("data-copy-label");
            if (status) status.textContent = "";
          }, 2000);
        },
      );
    });
  });
})();
`;
