export type W3cRss20Classification =
  | "accept"
  | "reject"
  | "project"
  | "not-applicable";

export type W3cRss20RootKind = "rss" | "other";

export type W3cRss20BoundaryError =
  | "MalformedXml"
  | "NotRss2Feed"
  | "UnsafeXml"
  | "LimitExceeded";

export type W3cRss20CaseReason =
  | "upstream-no-error-rss20"
  | "parser-boundary"
  | "dto-projection"
  | "unconsumed-element"
  | "validator-only-semantic-rule";

export type W3cRss20Case = {
  readonly path: string;
  readonly feature: string;
  readonly upstreamExpectation: string;
  readonly sha256: string;
  readonly rootKind: W3cRss20RootKind;
  readonly classification: W3cRss20Classification;
  readonly reason: W3cRss20CaseReason;
  readonly expectedError?: W3cRss20BoundaryError;
};
