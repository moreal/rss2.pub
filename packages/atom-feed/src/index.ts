import {
  DEFAULT_ATOM_LIMITS,
  type AtomFeedDto,
  type AtomParseResult,
  type AtomParserLimits,
} from "./model.js";
import { parseXml } from "./xml.js";

const ATOM_NAMESPACE = "http://www.w3.org/2005/Atom";

export type {
  AtomAuthorDto,
  AtomEntryDto,
  AtomFeedDto,
  AtomParseError,
  AtomParseResult,
  AtomParserLimits,
  AtomTextDto,
} from "./model.js";
export { DEFAULT_ATOM_LIMITS } from "./model.js";

export function parseAtom(
  xml: string,
  limits: Partial<AtomParserLimits> = {},
): AtomParseResult {
  const parsed = parseXml(xml, {
    maxDepth: limits.maxDepth ?? DEFAULT_ATOM_LIMITS.maxDepth,
    maxNodes: limits.maxNodes ?? DEFAULT_ATOM_LIMITS.maxNodes,
  });
  if (!parsed.ok) {
    return parsed;
  }
  if (parsed.root.namespace !== ATOM_NAMESPACE || parsed.root.localName !== "feed") {
    return { ok: false, error: { type: "NotAtomFeed" } };
  }
  return { ok: true, value: emptyFeed() };
}

function emptyFeed(): AtomFeedDto {
  return {
    id: null,
    title: null,
    subtitle: null,
    link: null,
    language: null,
    authors: [],
    entries: [],
  };
}
