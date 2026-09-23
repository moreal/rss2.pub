/** @jsxImportSource @solidjs/web */
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import {
  AccountHandle,
  Button,
  FeedCard,
  FeedList,
  Field,
  Notice,
  type FeedCardData,
} from "./index.js";

const host = "rss2.pub";
const longFeed: FeedCardData = {
  handle: "very_long_feed_account_name_01",
  title: "A long multilingual title about publishing feeds across languages — 여러 언어로 읽는 피드 이야기",
  description: "A description long enough to wrap on a narrow phone while keeping the source address and account handle within the card.",
  url: "https://example.com/a/very/long/path/to/a/feed/whose/source/address/must/not/widen/the/page.xml",
  iconUrl: null,
  href: "/@very_long_feed_account_name_01",
};

const meta = {
  title: "Foundations/Primitives",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const buttons = () => (
  <section class="panel">
    <h2>Action hierarchy</h2>
    <div class="form-actions">
      <Button variant="primary">Register feed</Button>
      <Button variant="secondary">Open profile</Button>
      <Button variant="quiet">Go back</Button>
    </div>
    <div class="form-actions">
      <Button variant="primary" disabled>Unavailable</Button>
    </div>
  </section>
);

export const ButtonsLight: Story = { render: buttons, parameters: { theme: "light" } };
export const ButtonsDark: Story = { render: buttons, parameters: { theme: "dark" } };

const notices = () => (
  <section class="panel">
    <h2>Status messages</h2>
    <Notice kind="success" title="Feed registered"><p>Readers can now follow this feed.</p></Notice>
    <Notice kind="error" title="Could not register"><p>Check the feed URL and try again.</p></Notice>
    <Notice kind="info" title="Search tip"><p>Search titles, descriptions, or source addresses.</p></Notice>
  </section>
);

export const NoticesLight: Story = { render: notices, parameters: { theme: "light" } };
export const NoticesDark: Story = { render: notices, parameters: { theme: "dark" } };

const longFeedCard = () => (
  <section class="panel">
    <h2>Long feed content</h2>
    <FeedList><FeedCard feed={longFeed} host={host} followersLabel="12,345 followers" /></FeedList>
  </section>
);

export const LongFeedLight: Story = { render: longFeedCard, parameters: { theme: "light" } };
export const LongFeedDark: Story = { render: longFeedCard, parameters: { theme: "dark" } };

const handles = () => (
  <section class="panel">
    <h2>Account identifiers</h2>
    <p class="feed-meta"><AccountHandle handle={longFeed.handle} host="a-very-long-fediverse-host.example" /></p>
    <p class="copy-row"><AccountHandle handle={longFeed.handle} host="a-very-long-fediverse-host.example" variant="copy" /></p>
  </section>
);

export const HandlesLight: Story = { render: handles, parameters: { theme: "light" } };
export const HandlesDark: Story = { render: handles, parameters: { theme: "dark" } };

const fieldHelp = () => (
  <section class="panel">
    <h2>Field with help</h2>
    <Field
      id="feed-url-help"
      name="url"
      type="url"
      label="Feed URL"
      placeholder="https://example.com/feed.xml"
      help="Enter the URL of an Atom or RSS 2.0 feed."
      required
    />
  </section>
);

export const FieldHelpLight: Story = { render: fieldHelp, parameters: { theme: "light" } };
export const FieldHelpDark: Story = { render: fieldHelp, parameters: { theme: "dark" } };

const fieldError = () => (
  <section class="panel">
    <h2>Field with error</h2>
    <Field
      id="feed-url-error"
      name="url"
      type="url"
      label="Feed URL"
      value="ftp://example.com/feed.xml"
      help="Use an HTTPS feed address."
      error="Only HTTP and HTTPS URLs are supported."
      required
    />
  </section>
);

export const FieldErrorLight: Story = { render: fieldError, parameters: { theme: "light" } };
export const FieldErrorDark: Story = { render: fieldError, parameters: { theme: "dark" } };

const narrowViewport = () => (
  <div style={{ "inline-size": "320px", "max-inline-size": "100%" }}>
    <section class="panel">
      <h2>Narrow viewport</h2>
      <Field id="narrow-search" name="q" type="search" label="Search feeds" help="Titles, descriptions, and addresses are searchable." />
      <FeedList><FeedCard feed={longFeed} host="a-very-long-fediverse-host.example" followersLabel="12,345 followers" /></FeedList>
      <p class="copy-row"><AccountHandle handle={longFeed.handle} host="a-very-long-fediverse-host.example" variant="copy" /></p>
      <div class="form-actions"><Button variant="primary">Register feed</Button></div>
    </section>
  </div>
);

export const NarrowViewportLight: Story = { render: narrowViewport, parameters: { theme: "light" } };
export const NarrowViewportDark: Story = { render: narrowViewport, parameters: { theme: "dark" } };
