export type W3cAtomClassification =
  | "accept"
  | "reject"
  | "project"
  | "not-applicable";

export type W3cAtomRootKind = "feed" | "entry" | "other";

export type W3cAtomBoundaryError = "MalformedXml" | "NotAtomFeed" | "UnsafeXml";

export type W3cAtomCaseReason =
  | "upstream-no-error-feed"
  | "product-rejects-entry-document"
  | "parser-boundary"
  | "dto-projection"
  | "unconsumed-element"
  | "validator-only-semantic-rule"
  | "extension-or-security-warning"
  | "requires-document-uri-resolution";

export type W3cAtomCase = {
  readonly path: string;
  readonly rfcSection: string;
  readonly upstreamExpectation: string;
  readonly sha256: string;
  readonly rootKind: W3cAtomRootKind;
  readonly classification: W3cAtomClassification;
  readonly reason: W3cAtomCaseReason;
  readonly expectedError?: W3cAtomBoundaryError;
};
