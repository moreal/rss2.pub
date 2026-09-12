import type { Rss2FeedDto, Rss2ItemDto } from "./model.js";
import type { XmlElement, XmlNode } from "./xml.js";

export function parseRss2Feed(channel: XmlElement): Rss2FeedDto {
  return {
    title: directChildText(channel, "title"),
    description: directChildText(channel, "description"),
    link: directChildText(channel, "link"),
    language: directChildText(channel, "language"),
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
  };
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

