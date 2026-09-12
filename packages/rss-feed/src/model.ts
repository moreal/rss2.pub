export type Rss2ParserLimits = {
  readonly maxDepth: number;
  readonly maxNodes: number;
};

export const DEFAULT_RSS2_LIMITS: Rss2ParserLimits = {
  maxDepth: 64,
  maxNodes: 100_000,
};

export type Rss2ParseError =
  | { readonly type: "MalformedXml"; readonly message: string }
  | { readonly type: "NotRss2Feed" }
  | { readonly type: "UnsafeXml"; readonly construct: "DOCTYPE" }
  | { readonly type: "LimitExceeded"; readonly limit: "depth" | "nodes" };

export type Rss2ParseResult =
  | { readonly ok: true; readonly value: Rss2FeedDto }
  | { readonly ok: false; readonly error: Rss2ParseError };

export type Rss2ItemDto = {
  readonly guid: string | null;
  readonly guidIsPermaLink: boolean;
  readonly link: string | null;
  readonly title: string | null;
  readonly description: string | null;
  readonly pubDate: string | null;
};

export type Rss2FeedDto = {
  readonly title: string | null;
  readonly description: string | null;
  readonly link: string | null;
  readonly language: string | null;
  readonly items: readonly Rss2ItemDto[];
};

