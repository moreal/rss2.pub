import type { Result } from "../../shared/result.js";
import type { FeedRequestBudget } from "./feed-fetcher.js";
import type { FeedUrl } from "../feed/feed-url.js";

/** Finds feed URLs advertised by a website's HTML alternate links. */
export type FeedDiscoverer = {
  discover(url: FeedUrl, budget?: FeedRequestBudget): Promise<Result<readonly FeedUrl[], string>>;
};
