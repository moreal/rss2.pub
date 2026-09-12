import {
  DEFAULT_RSS2_LIMITS,
  type Rss2ParseResult,
  type Rss2ParserLimits,
} from "./model.js";
import { parseRss2Feed } from "./rss2.js";
import { parseXml, type XmlElement, type XmlNode } from "./xml.js";

export type {
  Rss2FeedDto,
  Rss2ItemDto,
  Rss2ParseError,
  Rss2ParseResult,
  Rss2ParserLimits,
} from "./model.js";
export { DEFAULT_RSS2_LIMITS } from "./model.js";

function isRssRoot(root: XmlElement): boolean {
  if (root.namespace !== "" || root.localName !== "rss") {
    return false;
  }
  const version = root.attributes.get("version");
  return version !== undefined && version.startsWith("2");
}

function channelOf(root: XmlElement): XmlElement | null {
  for (const child of root.children) {
    if (isChannelElement(child)) {
      return child;
    }
  }
  return null;
}

function isChannelElement(node: XmlNode): node is XmlElement {
  return node.type === "element" && node.namespace === "" && node.localName === "channel";
}

export function parseRss2(
  xml: string,
  limits: Partial<Rss2ParserLimits> = {},
): Rss2ParseResult {
  const parsed = parseXml(xml, {
    maxDepth: limits.maxDepth ?? DEFAULT_RSS2_LIMITS.maxDepth,
    maxNodes: limits.maxNodes ?? DEFAULT_RSS2_LIMITS.maxNodes,
  });
  if (!parsed.ok) {
    return parsed;
  }
  if (!isRssRoot(parsed.root)) {
    return { ok: false, error: { type: "NotRss2Feed" } };
  }
  const channel = channelOf(parsed.root);
  if (channel === null) {
    return { ok: false, error: { type: "NotRss2Feed" } };
  }
  return { ok: true, value: parseRss2Feed(channel) };
}

