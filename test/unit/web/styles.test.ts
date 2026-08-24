import { describe, expect, it } from "vitest";
import { STYLE } from "../../../src/web/ui/styles.js";

/**
 * The stylesheet's contract with accessibility, pinned.
 *
 * `styles.ts` claims its text colours are chosen for contrast rather than for
 * brand, and that both themes clear WCAG 2.2 AA. Nothing enforced that: the
 * palette is a wall of hex literals, and picking a slightly prettier grey for
 * `--text-subtle` — or a slightly brighter orange for `--accent-ink` — would
 * have shipped silently. Every pair below is one a page actually renders, so
 * a failure here is a real contrast regression, not a style opinion.
 */

/** Hex tokens declared in a `:root { … }` block, in source order. */
function parseTokens(block: string): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const match of block.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-f]{6});/gi)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) tokens.set(name, value);
  }
  return tokens;
}

/**
 * The light palette is the base and the dark block overrides only the roles
 * whose value changes, exactly as the cascade applies them — so the themes
 * must be merged the same way before anything is measured.
 */
function themes(): { light: Map<string, string>; dark: Map<string, string> } {
  const blocks = STYLE.match(/:root \{[\s\S]*?\n {2}\}/g);
  expect(blocks, "styles.ts should declare a light and a dark :root block")
    .toHaveLength(2);
  const light = parseTokens((blocks ?? [])[0] ?? "");
  const dark = new Map([...light, ...parseTokens((blocks ?? [])[1] ?? "")]);
  return { light, dark };
}

/** Relative luminance, per WCAG 2.2 §Relative luminance. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const channel = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return (
    0.2126 * (channels[0] ?? 0) +
    0.7152 * (channels[1] ?? 0) +
    0.0722 * (channels[2] ?? 0)
  );
}

function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a,
  );
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

/** Foreground/background role pairs that some page puts on screen. */
const AA_PAIRS: readonly (readonly [string, string])[] = [
  // Body copy and headings, on all three surfaces a page uses.
  ["--text", "--bg"],
  ["--text", "--surface"],
  ["--text", "--surface-2"],
  // Ledes, help text, footer, follower counts.
  ["--text-muted", "--bg"],
  ["--text-muted", "--surface"],
  ["--text-muted", "--surface-2"],
  // The quietest text the design allows: card metadata and placeholders.
  ["--text-subtle", "--bg"],
  ["--text-subtle", "--surface"],
  ["--text-subtle", "--surface-2"],
  // Links, and the full-content badge that sits on a tinted chip.
  ["--accent-ink", "--bg"],
  ["--accent-ink", "--surface"],
  ["--accent-ink", "--surface-2"],
  ["--accent-ink", "--accent-soft"],
  // Filled controls: the primary button, and the copy button once it has
  // confirmed — the one place a fill flips to the success role.
  ["--on-accent", "--accent"],
  ["--on-success", "--success"],
  // Notice text on its own tinted panel.
  ["--danger", "--danger-bg"],
  ["--success", "--success-bg"],
];

describe("design tokens", () => {
  const { light, dark } = themes();

  it.each([
    ["light", light],
    ["dark", dark],
  ])("defines every role the components reference in %s", (_name, theme) => {
    for (const pair of AA_PAIRS) {
      for (const role of pair) expect(theme.get(role)).toBeDefined();
    }
  });

  describe.each([
    ["light", light],
    ["dark", dark],
  ])("%s theme clears WCAG 2.2 AA", (_name, theme) => {
    it.each(AA_PAIRS)("%s on %s", (foreground, background) => {
      const fg = theme.get(foreground);
      const bg = theme.get(background);
      expect(fg).toBeDefined();
      expect(bg).toBeDefined();
      // 4.5:1 — the normal-text threshold. Nothing in this palette is only
      // ever used at large-text sizes, so none of it gets the 3:1 exemption.
      expect(contrast(fg ?? "", bg ?? "")).toBeGreaterThanOrEqual(4.5);
    });
  });

  /**
   * The brand orange is deliberately *not* in AA_PAIRS: it is bright enough
   * to fail as text, which is exactly why the stylesheet restricts it to the
   * decorative RSS mark. This pins that reasoning so nobody "fixes" the
   * inconsistency by using --brand for a label.
   */
  it("keeps the brand orange out of text roles", () => {
    expect(contrast(light.get("--brand") ?? "", light.get("--surface") ?? ""))
      .toBeLessThan(4.5);
    expect(STYLE).not.toMatch(/color:\s*var\(--brand\)[^;]*;\s*\/\* text/);
  });
});

describe("stylesheet integrity", () => {
  /**
   * STYLE is one template literal emitted through raw(). A stray backtick
   * terminates it early, which is a build error rather than a test failure —
   * but a dollar-brace would silently interpolate instead, and CSS is full of
   * braces. Neither belongs in here.
   */
  it("contains no template-literal escape hatches", () => {
    expect(STYLE).not.toContain("`");
    expect(STYLE).not.toContain("${");
  });

  /**
   * The feed list clips its two identifiers — the handle and the source URL —
   * onto one line each rather than wrapping them. That only holds while every
   * box above them opts out of the automatic minimum size: a grid item's
   * default `min-width: auto` is its content's min-content width, and a
   * nowrap handle's min-content is the whole handle. Drop either escape and
   * the widest row in the list widens the column, which scrolls the page
   * sideways on a phone — measured at 375px, not theorised.
   */
  it("lets the clipped identifiers shrink instead of widening the page", () => {
    expect(STYLE).toMatch(/ul\.feeds li \{[^}]*min-width: 0/);
    expect(STYLE).toMatch(/\.feed-meta \{[^}]*min-width: 0/);
    expect(STYLE).toMatch(
      /\.handle, \.feed-src \{[^}]*text-overflow: ellipsis/,
    );
  });

  /**
   * A feed's title and description are written by the feed, in whatever
   * language the feed is in — the `:lang(ko)` rule keyed to the *page* cannot
   * reach a Korean feed listed on an English page, which then breaks
   * mid-eojeol. `keep-all` fixes that and beats `overflow-wrap: break-word`,
   * so the pair that also contains a long bare domain is `anywhere`.
   */
  it("wraps feed-supplied text by the content's language, not the page's", () => {
    expect(STYLE).toMatch(
      /\.feed-title, \.feed-desc \{ word-break: keep-all; overflow-wrap: anywhere; \}/,
    );
  });

  /**
   * Rule 1 of the file's own header: only the token blocks name raw values.
   * Component rules reference var(--…). Checked outside the :root blocks so
   * the tokens themselves are exempt.
   */
  it("keeps raw colour values inside the token blocks", () => {
    const withoutTokenBlocks = STYLE.replace(/:root \{[\s\S]*?\n {2}\}/g, "");
    expect(withoutTokenBlocks).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(withoutTokenBlocks).not.toMatch(/\b(rgb|hsl)a?\(/i);
  });
});
