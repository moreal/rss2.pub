import { expect, it } from "vitest";
import { isMastodonAccountFeed } from "../../../../src/domain/feed/feed-generator.js";
import { FeedUrl } from "../../../../src/domain/feed/feed-url.js";
import { unwrap } from "../../../helpers/result.js";

it("identifies a Mastodon account RSS without rejecting hashtag feeds", () => {
  const feed = (url: string) => unwrap(FeedUrl.create(url));
  expect(isMastodonAccountFeed("Mastodon v4.3.0", feed("https://social.example/@alice.rss"))).toBe(true);
  expect(isMastodonAccountFeed("mastodon", feed("https://social.example/users/alice.rss"))).toBe(true);
  expect(isMastodonAccountFeed("Mastodon", feed("https://social.example/tags/cats.rss"))).toBe(false);
  expect(isMastodonAccountFeed("Mastodon", feed("https://social.example/@alice/tagged/cats.rss"))).toBe(false);
  expect(isMastodonAccountFeed("WordPress", feed("https://social.example/@alice.rss"))).toBe(false);
  expect(isMastodonAccountFeed(null, feed("https://social.example/@alice.rss"))).toBe(false);
});
