import { SaxesParser, type SaxesAttributeNS, type SaxesTagNS } from "saxes";

import type { AtomParseError, AtomParserLimits } from "./model.js";

export type XmlNode = XmlElement | { readonly type: "text"; readonly value: string };

export type XmlElement = {
  readonly type: "element";
  readonly namespace: string;
  readonly localName: string;
  readonly qualifiedName: string;
  readonly attributes: ReadonlyMap<string, string>;
  readonly children: readonly XmlNode[];
};

type MutableXmlElement = {
  type: "element";
  namespace: string;
  localName: string;
  qualifiedName: string;
  attributes: Map<string, string>;
  children: XmlNode[];
};

type XmlParseResult =
  | { readonly ok: true; readonly root: XmlElement }
  | { readonly ok: false; readonly error: AtomParseError };

class ParseAbort extends Error {
  public constructor(public readonly parseError: AtomParseError) {
    super(parseError.type);
  }
}

export function parseXml(xml: string, limits: AtomParserLimits): XmlParseResult {
  const frames: MutableXmlElement[] = [];
  const roots: XmlElement[] = [];
  let nodes = 0;
  const parser = new SaxesParser({ xmlns: true });

  parser.on("doctype", () => {
    throw new ParseAbort({ type: "UnsafeXml", construct: "DOCTYPE" });
  });
  parser.on("opentag", (tag) => {
    const depth = frames.length + 1;
    if (depth > limits.maxDepth) {
      throw new ParseAbort({ type: "LimitExceeded", limit: "depth" });
    }

    countNode(() => {
      nodes += 1;
    }, nodes, limits.maxNodes);
    const frame = mutableElement(tag);
    frames.push(frame);
  });
  parser.on("text", (value) => {
    appendText(value, frames, () => {
      nodes += 1;
    }, nodes, limits.maxNodes);
  });
  parser.on("cdata", (value) => {
    appendText(value, frames, () => {
      nodes += 1;
    }, nodes, limits.maxNodes);
  });
  parser.on("closetag", () => {
    const frame = frames.pop();
    if (frame === undefined) {
      throw new ParseAbort({
        type: "MalformedXml",
        message: "XML closed an element that was not open",
      });
    }

    const element = freezeElement(frame);
    const parent = frames.at(-1);
    if (parent === undefined) {
      roots.push(element);
    } else {
      parent.children.push(element);
    }
  });
  parser.on("error", (error) => {
    throw new ParseAbort({ type: "MalformedXml", message: error.message });
  });

  try {
    parser.write(xml).close();
  } catch (error: unknown) {
    if (error instanceof ParseAbort) {
      return { ok: false, error: error.parseError };
    }
    if (error instanceof Error) {
      return { ok: false, error: { type: "MalformedXml", message: error.message } };
    }
    return { ok: false, error: { type: "MalformedXml", message: "Invalid XML" } };
  }

  if (roots.length !== 1 || frames.length !== 0) {
    return {
      ok: false,
      error: { type: "MalformedXml", message: "XML must contain exactly one root element" },
    };
  }

  const root = roots[0];
  if (root === undefined) {
    return {
      ok: false,
      error: { type: "MalformedXml", message: "XML must contain exactly one root element" },
    };
  }
  return { ok: true, root };
}

function mutableElement(tag: SaxesTagNS): MutableXmlElement {
  const attributes = new Map<string, string>();
  for (const attribute of Object.values(tag.attributes)) {
    attributes.set(attributeKey(attribute), attribute.value);
  }
  return {
    type: "element",
    namespace: tag.uri,
    localName: tag.local,
    qualifiedName: tag.name,
    attributes,
    children: [],
  };
}

function attributeKey(attribute: SaxesAttributeNS): string {
  return attribute.uri === "" ? attribute.name : `{${attribute.uri}}${attribute.local}`;
}

function countNode(
  increment: () => void,
  currentNodes: number,
  maxNodes: number,
): void {
  if (currentNodes + 1 > maxNodes) {
    throw new ParseAbort({ type: "LimitExceeded", limit: "nodes" });
  }
  increment();
}

function appendText(
  value: string,
  frames: MutableXmlElement[],
  increment: () => void,
  currentNodes: number,
  maxNodes: number,
): void {
  if (value === "") {
    return;
  }
  const parent = frames.at(-1);
  if (parent === undefined) {
    return;
  }
  countNode(increment, currentNodes, maxNodes);
  parent.children.push({ type: "text", value });
}

function freezeElement(element: MutableXmlElement): XmlElement {
  return {
    type: "element",
    namespace: element.namespace,
    localName: element.localName,
    qualifiedName: element.qualifiedName,
    attributes: new Map(element.attributes),
    children: [...element.children],
  };
}
