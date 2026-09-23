/** @jsxImportSource @solidjs/web */
import { For } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { Button, Field, Notice } from "./primitives/index.js";
import { LocalePicker } from "./locale-picker.js";
import "./design-system.stories.css";

const meta = { title: "Design system/Overview" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const colors = [
  ["bg", "Page background"], ["surface", "Panels and controls"],
  ["surface-2", "Selected and quiet surfaces"], ["text", "Primary text"],
  ["text-muted", "Secondary text"], ["text-subtle", "Supporting metadata"],
  ["border", "Surface boundaries"], ["border-strong", "Control boundaries"],
  ["accent", "Primary action fill"], ["accent-ink", "Links and accent text"],
  ["accent-soft", "Soft accent surface"], ["brand", "Decoration only"],
  ["success", "Success text"], ["success-bg", "Success surface"],
  ["danger", "Error text"], ["danger-bg", "Error surface"],
  ["focus", "Keyboard focus ring"],
];
const typeSizes = ["xs", "sm", "base", "lg", "xl", "2xl"];
const spaces = [1, 2, 3, 4, 5, 6, 7];
const inventory = [
  ["Buttons", "One primary action per task; secondary for a useful follow-up, quiet for a way out.", "foundations-primitives--buttons-light"],
  ["Fields", "Visible labels, connected help text, and specific errors. Inputs retain a readable 16px size.", "foundations-primitives--field-error-light"],
  ["Notices", "Explain outcomes with text and an icon as well as color.", "foundations-primitives--notices-light"],
  ["Feed cards", "Titles wrap. Handles and source addresses truncate inside the reading column.", "foundations-primitives--long-feed-light"],
  ["Account identifiers", "Use the copy variant when readers need the complete federated address.", "foundations-primitives--handles-light"],
  ["Locale picker", "Stable trigger width, native language names, current selection, and keyboard navigation.", "navigation-locale-picker--traditional-chinese-light"],
  ["Bidirectional text", "A synthetic Arabic fixture checks direction and mixed scripts; it does not add a supported product locale.", "navigation-locale-picker--rtl-bidi-light"],
  ["Narrow viewport", "Stress cases for long content and a 320px reading area.", "foundations-primitives--narrow-viewport-light"],
];

function Overview() {
  return (
    <main class="ds-guide">
      <header class="ds-intro">
        <p class="ds-eyebrow">rss2.pub / Design system</p>
        <h1>A small system for readable feeds.</h1>
        <p>Shared semantic tokens and Solid primitives power the product and these stories. Switch the theme in the toolbar to inspect the same roles in either palette.</p>
        <nav class="ds-links" aria-label="Design system sections">
          <a href="#colors">Colors</a><a href="#typography">Typography</a><a href="#spacing">Spacing & shape</a><a href="#components">Components</a><a href="#accessibility">Accessibility</a>
        </nav>
      </header>
      <section class="panel" id="colors" aria-labelledby="colors-title">
        <div class="panel-head"><h2 id="colors-title">Semantic color</h2><p>Use roles, not literal colors. The brand orange is decorative; text uses the contrast-tested accent and text roles.</p></div>
        <ul class="ds-swatches"><For each={colors}>{([token, label]) => <li class="ds-swatch">
          <span class="ds-swatch-chip" style={{ background: `var(--${token})` }} aria-hidden="true" />
          <div><code>--{token}</code><p>{label}</p></div>
        </li>}</For></ul>
        <div class="ds-pairs"><p class="ds-accent-pair">Accent / on-accent</p><p class="ds-success-pair">Success / success-bg</p><p class="ds-danger-pair">Danger / danger-bg</p></div>
      </section>
      <section class="panel" id="typography" aria-labelledby="type-title">
        <div class="panel-head"><h2 id="type-title">Typography</h2><p>System fonts, a compact scale, and clear hierarchy through spacing and weight. Monospace is reserved for identifiers.</p></div>
        <ul class="ds-type-list"><For each={typeSizes}>{(size) => <li><code>--text-{size}</code><p style={{ "font-size": `var(--text-${size})` }}>Feeds worth following · 읽고 싶은 피드</p></li>}</For></ul>
        <p class="ds-mono">@readable_feeds@rss2.pub</p>
      </section>
      <section class="panel" id="spacing" aria-labelledby="space-title">
        <div class="panel-head"><h2 id="space-title">Spacing & shape</h2><p>A 4px-based scale keeps related controls close and separates sections. Reading width: <code>--container</code>. Minimum touch target: <code>--tap</code> (44px).</p></div>
        <ul class="ds-space-list"><For each={spaces}>{(step) => <li><code>--space-{step}</code><span style={{ "inline-size": `var(--space-${step})` }} aria-hidden="true" /></li>}</For></ul>
        <ul class="ds-radii"><For each={["xs", "sm", "md", "lg"]}>{(size) => <li style={{ "border-radius": `var(--radius-${size})` }}><code>--radius-{size}</code></li>}</For></ul>
      </section>
      <section class="panel" id="components" aria-labelledby="components-title">
        <div class="panel-head"><h2 id="components-title">Component inventory</h2><p>Each primitive has focused light and dark stories. Use the examples to inspect long content, errors, and narrow layouts.</p></div>
        <div class="ds-example">
          <div class="form-actions"><Button variant="primary">Register feed</Button><Button variant="secondary">Open profile</Button><Button variant="quiet">Go back</Button></div>
          <Field id="ds-feed-url" name="url" type="url" label="Feed URL" placeholder="https://example.com/feed.xml" help="Enter an Atom or RSS 2.0 feed address." />
          <Notice kind="success" title="Feed registered"><p>Readers can now follow this feed.</p></Notice>
          <div class="ds-locale-example"><p>Read in your language</p><LocalePicker currentLocale="en" currentShortLabel="EN" buttonLabel="Choose language" options={[{ locale: "en", label: "English", href: "?lang=en" }, { locale: "ko", label: "한국어", href: "?lang=ko" }, { locale: "pt-PT", label: "Português (Portugal)", href: "?lang=pt-PT" }]} /></div>
        </div>
        <ul class="ds-inventory"><For each={inventory}>{([name, description, story]) => <li><a href={`./?path=/story/${story}`} target="_top">{name}<span aria-hidden="true">→</span></a><p>{description}</p></li>}</For></ul>
      </section>
      <section class="panel" id="accessibility" aria-labelledby="a11y-title">
        <h2 id="a11y-title">Built for reading and interaction</h2>
        <ul class="ds-checklist"><li>Text role pairs meet WCAG AA contrast in both themes.</li><li>Use Tab to inspect visible focus rings; Escape returns focus from the language popover.</li><li>Check at 320px and 200% zoom. Long text must remain readable without horizontal page scrolling.</li><li>Reduced motion removes nonessential movement. State is always expressed through text, shape, or color.</li></ul>
        <p class="ds-source">Source of truth: <code>src/web/ui/styles.ts</code>. Primitives: <code>packages/web-ui/src/primitives</code>. Language control: <code>packages/web-ui/src/locale-picker</code>.</p>
      </section>
    </main>
  );
}

export const Light: Story = { render: () => <Overview />, parameters: { theme: "light" } };
export const Dark: Story = { render: () => <Overview />, parameters: { theme: "dark" } };
