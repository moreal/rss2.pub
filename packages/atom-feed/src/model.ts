export type AtomParserLimits = {
  readonly maxDepth: number;
  readonly maxNodes: number;
};

export const DEFAULT_ATOM_LIMITS: AtomParserLimits = {
  maxDepth: 64,
  maxNodes: 100_000,
};

export type AtomParseError =
  | { readonly type: "MalformedXml"; readonly message: string }
  | { readonly type: "NotAtomFeed" }
  | { readonly type: "UnsafeXml"; readonly construct: "DOCTYPE" }
  | { readonly type: "LimitExceeded"; readonly limit: "depth" | "nodes" };

export type AtomParseResult =
  | { readonly ok: true; readonly value: AtomFeedDto }
  | { readonly ok: false; readonly error: AtomParseError };

export type AtomTextDto = {
  readonly type: "text" | "html" | "xhtml";
  readonly value: string;
  readonly plainText: string;
};

export type AtomAuthorDto = {
  readonly name: string | null;
  readonly uri: string | null;
  readonly email: string | null;
};

export type AtomEntryDto = {
  readonly id: string | null;
  readonly link: string | null;
  readonly title: AtomTextDto | null;
  readonly summary: AtomTextDto | null;
  readonly content: AtomTextDto | null;
  readonly published: string | null;
  readonly updated: string | null;
  readonly language: string | null;
  readonly authors: readonly AtomAuthorDto[];
};

export type AtomFeedDto = {
  readonly id: string | null;
  readonly title: AtomTextDto | null;
  readonly subtitle: AtomTextDto | null;
  readonly link: string | null;
  readonly language: string | null;
  readonly authors: readonly AtomAuthorDto[];
  readonly entries: readonly AtomEntryDto[];
};
