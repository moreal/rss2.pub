import type { Result } from "../../shared/result.js";
import type { FeedUrl } from "../feed/feed-url.js";

/** Finds feed URLs advertised by a website's HTML alternate links. */
export type FeedDiscoverer = {
  discover(url: FeedUrl): Promise<Result<readonly FeedUrl[], string>>;
};
