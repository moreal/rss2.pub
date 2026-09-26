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

export type Rss2CategoryDto = {
  readonly value: string;
  readonly domain: string | null;
};

export type Rss2EnclosureDto = {
  readonly url: string | null;
  readonly length: string | null;
  readonly type: string | null;
};

export type Rss2SourceDto = {
  readonly value: string | null;
  readonly url: string | null;
};

export type Rss2CloudDto = {
  readonly domain: string | null;
  readonly port: string | null;
  readonly path: string | null;
  readonly registerProcedure: string | null;
  readonly protocol: string | null;
};

export type Rss2ImageDto = {
  readonly title: string | null;
  readonly url: string | null;
  readonly link: string | null;
  readonly width: string | null;
  readonly height: string | null;
  readonly description: string | null;
};

export type Rss2TextInputDto = {
  readonly title: string | null;
  readonly description: string | null;
  readonly name: string | null;
  readonly link: string | null;
};

export type Rss2ItemDto = {
  readonly guid: string | null;
  readonly guidIsPermaLink: boolean;
  readonly link: string | null;
  readonly title: string | null;
  readonly description: string | null;
  readonly pubDate: string | null;
  readonly author: string | null;
  readonly categories: readonly Rss2CategoryDto[];
  readonly comments: string | null;
  readonly enclosure: Rss2EnclosureDto | null;
  readonly source: Rss2SourceDto | null;
  readonly contentEncoded: string | null;
};

export type Rss2FeedDto = {
  readonly title: string | null;
  readonly description: string | null;
  readonly link: string | null;
  readonly language: string | null;
  readonly pubDate: string | null;
  readonly lastBuildDate: string | null;
  readonly generator: string | null;
  readonly docs: string | null;
  readonly ttl: string | null;
  readonly copyright: string | null;
  readonly managingEditor: string | null;
  readonly webMaster: string | null;
  readonly rating: string | null;
  readonly categories: readonly Rss2CategoryDto[];
  readonly cloud: Rss2CloudDto | null;
  readonly image: Rss2ImageDto | null;
  readonly textInput: Rss2TextInputDto | null;
  readonly skipHours: readonly string[];
  readonly skipDays: readonly string[];
  readonly items: readonly Rss2ItemDto[];
};

