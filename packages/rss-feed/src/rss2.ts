import type {
  Rss2CategoryDto,
  Rss2CloudDto,
  Rss2EnclosureDto,
  Rss2FeedDto,
  Rss2ImageDto,
  Rss2ItemDto,
  Rss2SourceDto,
  Rss2TextInputDto,
} from "./model.js";
import type { XmlElement, XmlNode } from "./xml.js";

const CONTENT_MODULE_NAMESPACE = "http://purl.org/rss/1.0/modules/content/";

export function parseRss2Feed(channel: XmlElement): Rss2FeedDto {
  return {
    title: directChildText(channel, "title"),
    description: directChildText(channel, "description"),
    link: directChildText(channel, "link"),
    language: directChildText(channel, "language"),
    pubDate: directChildText(channel, "pubDate"),
    lastBuildDate: directChildText(channel, "lastBuildDate"),
    generator: directChildText(channel, "generator"),
    docs: directChildText(channel, "docs"),
    ttl: directChildText(channel, "ttl"),
    copyright: directChildText(channel, "copyright"),
    managingEditor: directChildText(channel, "managingEditor"),
    webMaster: directChildText(channel, "webMaster"),
    rating: directChildText(channel, "rating"),
    categories: directChildren(channel, "category").map(parseCategory),
    cloud: cloudOf(channel),
    image: imageOf(channel),
    textInput: textInputOf(channel),
    skipHours: childTexts(channel, "skipHours", "hour"),
    skipDays: childTexts(channel, "skipDays", "day"),
    items: directChildren(channel, "item").map(parseItem),
  };
}

function parseItem(item: XmlElement): Rss2ItemDto {
  const guid = directChild(item, "guid");
  return {
    guid: guid === null ? null : textValue(guid),
    guidIsPermaLink: guid === null ? false : guid.attributes.get("isPermaLink") !== "false",
    link: directChildText(item, "link"),
    title: directChildText(item, "title"),
    description: directChildText(item, "description"),
    pubDate: directChildText(item, "pubDate"),
    author: directChildText(item, "author"),
    categories: directChildren(item, "category").map(parseCategory),
    comments: directChildText(item, "comments"),
    enclosure: enclosureOf(item),
    source: sourceOf(item),
    contentEncoded: namespacedChildText(item, CONTENT_MODULE_NAMESPACE, "encoded"),
  };
}

function parseCategory(element: XmlElement): Rss2CategoryDto {
  return {
    value: textValue(element),
    domain: element.attributes.get("domain") ?? null,
  };
}

function enclosureOf(item: XmlElement): Rss2EnclosureDto | null {
  const enclosure = directChild(item, "enclosure");
  if (enclosure === null) {
    return null;
  }
  return {
    url: enclosure.attributes.get("url") ?? null,
    length: enclosure.attributes.get("length") ?? null,
    type: enclosure.attributes.get("type") ?? null,
  };
}

function sourceOf(item: XmlElement): Rss2SourceDto | null {
  const source = directChild(item, "source");
  if (source === null) {
    return null;
  }
  return {
    value: textValue(source),
    url: source.attributes.get("url") ?? null,
  };
}

function cloudOf(channel: XmlElement): Rss2CloudDto | null {
  const cloud = directChild(channel, "cloud");
  if (cloud === null) {
    return null;
  }
  return {
    domain: cloud.attributes.get("domain") ?? null,
    port: cloud.attributes.get("port") ?? null,
    path: cloud.attributes.get("path") ?? null,
    registerProcedure: cloud.attributes.get("registerProcedure") ?? null,
    protocol: cloud.attributes.get("protocol") ?? null,
  };
}

function imageOf(channel: XmlElement): Rss2ImageDto | null {
  const image = directChild(channel, "image");
  if (image === null) {
    return null;
  }
  return {
    title: directChildText(image, "title"),
    url: directChildText(image, "url"),
    link: directChildText(image, "link"),
    width: directChildText(image, "width"),
    height: directChildText(image, "height"),
    description: directChildText(image, "description"),
  };
}

function textInputOf(channel: XmlElement): Rss2TextInputDto | null {
  const textInput = directChild(channel, "textInput");
  if (textInput === null) {
    return null;
  }
  return {
    title: directChildText(textInput, "title"),
    description: directChildText(textInput, "description"),
    name: directChildText(textInput, "name"),
    link: directChildText(textInput, "link"),
  };
}

function childTexts(
  parent: XmlElement,
  containerName: string,
  childName: string,
): readonly string[] {
  const container = directChild(parent, containerName);
  if (container === null) {
    return [];
  }
  return directChildren(container, childName).map(textValue);
}

function directChild(parent: XmlElement, localName: string): XmlElement | null {
  for (const child of parent.children) {
    if (isRssElement(child, localName)) {
      return child;
    }
  }
  return null;
}

function directChildren(parent: XmlElement, localName: string): XmlElement[] {
  return parent.children.filter((child): child is XmlElement => isRssElement(child, localName));
}

function isRssElement(node: XmlNode, localName: string): node is XmlElement {
  return node.type === "element" && node.namespace === "" && node.localName === localName;
}

function namespacedChildText(
  parent: XmlElement,
  namespace: string,
  localName: string,
): string | null {
  for (const child of parent.children) {
    if (child.type === "element" && child.namespace === namespace && child.localName === localName) {
      return textValue(child);
    }
  }
  return null;
}

function directChildText(parent: XmlElement, localName: string): string | null {
  const child = directChild(parent, localName);
  return child === null ? null : textValue(child);
}

function textValue(element: XmlElement): string {
  return element.children.map(textFromNode).join("");
}

function textFromNode(node: XmlNode): string {
  return node.type === "text" ? node.value : textValue(node);
}

