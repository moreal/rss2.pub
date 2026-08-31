import type {
  AtomAuthorDto,
  AtomEntryDto,
  AtomFeedDto,
  AtomTextDto,
} from "./model.js";
import type { XmlElement, XmlNode } from "./xml.js";

const ATOM_NAMESPACE = "http://www.w3.org/2005/Atom";
const XHTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";
const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";
const XML_LANGUAGE_ATTRIBUTE = `{${XML_NAMESPACE}}lang`;

export function parseAtomFeed(feed: XmlElement): AtomFeedDto {
  const language = effectiveLanguage(feed, null);
  const authors = authorsOf(feed);
  return {
    id: directChildText(feed, "id"),
    title: textConstruct(directChild(feed, "title")),
    subtitle: textConstruct(directChild(feed, "subtitle")),
    link: alternateLink(feed),
    language,
    authors,
    entries: directChildren(feed, "entry").map((entry) => parseEntry(entry, language, authors)),
  };
}

function parseEntry(
  entry: XmlElement,
  feedLanguage: string | null,
  feedAuthors: readonly AtomAuthorDto[],
): AtomEntryDto {
  const content = directChild(entry, "content");
  const entryAuthors = authorsOf(entry);
  const source = directChild(entry, "source");
  const sourceAuthors = source === null ? [] : authorsOf(source);
  const effectiveAuthors = entryAuthors.length > 0
    ? entryAuthors
    : sourceAuthors.length > 0
      ? sourceAuthors
      : feedAuthors;
  return {
    id: directChildText(entry, "id"),
    link: alternateLink(entry),
    title: textConstruct(directChild(entry, "title")),
    summary: textConstruct(directChild(entry, "summary")),
    content: content === null || content.attributes.has("src") ? null : textConstruct(content),
    published: directChildText(entry, "published"),
    updated: directChildText(entry, "updated"),
    language: effectiveLanguage(entry, feedLanguage),
    authors: copyAuthors(effectiveAuthors),
  };
}

function effectiveLanguage(element: XmlElement, inherited: string | null): string | null {
  const language = element.attributes.get(XML_LANGUAGE_ATTRIBUTE);
  if (language === undefined) {
    return inherited;
  }

  const trimmed = language.trim();
  return trimmed === "" ? null : trimmed;
}

function authorsOf(parent: XmlElement): readonly AtomAuthorDto[] {
  return directChildren(parent, "author").map((author) => ({
    name: directChildText(author, "name"),
    uri: directChildText(author, "uri"),
    email: directChildText(author, "email"),
  }));
}

function copyAuthors(authors: readonly AtomAuthorDto[]): readonly AtomAuthorDto[] {
  return authors.map((author) => ({ ...author }));
}

function directChild(parent: XmlElement, localName: string): XmlElement | null {
  for (const child of parent.children) {
    if (isAtomElement(child, localName)) {
      return child;
    }
  }
  return null;
}

function directChildren(parent: XmlElement, localName: string): XmlElement[] {
  return parent.children.filter((child): child is XmlElement => isAtomElement(child, localName));
}

function isAtomElement(node: XmlNode, localName: string): node is XmlElement {
  return node.type === "element"
    && node.namespace === ATOM_NAMESPACE
    && node.localName === localName;
}

function directChildText(parent: XmlElement, localName: string): string | null {
  const child = directChild(parent, localName);
  return child === null ? null : textValue(child);
}

function alternateLink(parent: XmlElement): string | null {
  for (const link of directChildren(parent, "link")) {
    const relation = link.attributes.get("rel");
    if (relation === undefined || relation === "alternate") {
      return link.attributes.get("href") ?? null;
    }
  }
  return null;
}

function textConstruct(element: XmlElement | null): AtomTextDto | null {
  if (element === null) {
    return null;
  }

  const type = textType(element);
  if (type === "xhtml") {
    return xhtmlTextConstruct(element);
  }

  const value = textValue(element);
  return {
    type,
    value,
    plainText: type === "html" ? stripHtmlTags(value) : value,
  };
}

function textType(element: XmlElement): "text" | "html" | "xhtml" {
  const type = element.attributes.get("type");
  return type === "html" || type === "xhtml" ? type : "text";
}

function xhtmlTextConstruct(element: XmlElement): AtomTextDto | null {
  const elementChildren = element.children.filter(isElement);
  if (elementChildren.length !== 1 || element.children.some(isNonWhitespaceText)) {
    return null;
  }

  const div = elementChildren[0];
  if (div === undefined
    || div.namespace !== XHTML_NAMESPACE
    || div.localName !== "div"
    || hasNonXhtmlDescendant(div)) {
    return null;
  }

  return {
    type: "xhtml",
    value: div.children.map(serializeXmlNode).join(""),
    plainText: textValue(div),
  };
}

function hasNonXhtmlDescendant(element: XmlElement): boolean {
  return element.children.some((child) => child.type === "element"
    && (child.namespace !== XHTML_NAMESPACE || hasNonXhtmlDescendant(child)));
}

function isElement(node: XmlNode): node is XmlElement {
  return node.type === "element";
}

function isNonWhitespaceText(node: XmlNode): boolean {
  return node.type === "text" && node.value.trim() !== "";
}

function textValue(element: XmlElement): string {
  return element.children.map(textFromNode).join("");
}

function textFromNode(node: XmlNode): string {
  return node.type === "text" ? node.value : textValue(node);
}

function stripHtmlTags(value: string): string {
  let plainText = "";
  let index = 0;

  while (index < value.length) {
    if (value.charAt(index) !== "<" || !isHtmlTagStart(value, index)) {
      plainText += value.charAt(index);
      index += 1;
      continue;
    }

    const end = htmlTagEnd(value, index);
    if (end === null) {
      plainText += "<";
      index += 1;
      continue;
    }

    index = end + 1;
  }

  return plainText;
}

function isHtmlTagStart(value: string, index: number): boolean {
  const next = value.charAt(index + 1);
  if (next === "/") {
    return isHtmlNameStart(value.charAt(index + 2));
  }
  return next === "!" || next === "?" || isHtmlNameStart(next);
}

function isHtmlNameStart(character: string): boolean {
  return (character >= "A" && character <= "Z") || (character >= "a" && character <= "z");
}

function htmlTagEnd(value: string, start: number): number | null {
  let quote: '"' | "'" | null = null;
  for (let index = start + 1; index < value.length; index += 1) {
    const character = value.charAt(index);
    if (quote !== null) {
      if (character === quote) {
        quote = null;
      }
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index;
    }
  }
  return null;
}

function serializeXmlNode(node: XmlNode): string {
  if (node.type === "text") {
    return escapeXmlText(node.value);
  }

  const attributes = serializeAttributes(node.attributes);
  if (node.children.length === 0) {
    return `<${node.localName}${attributes}/>`;
  }
  return `<${node.localName}${attributes}>${node.children.map(serializeXmlNode).join("")}</${node.localName}>`;
}

function serializeAttributes(attributes: ReadonlyMap<string, string>): string {
  let serialized = "";
  for (const [key, value] of attributes) {
    const name = serializedAttributeName(key);
    if (name !== null) {
      serialized += ` ${name}="${escapeXmlAttribute(value)}"`;
    }
  }
  return serialized;
}

function serializedAttributeName(key: string): string | null {
  if (!key.startsWith("{")) {
    return key;
  }

  const separator = key.indexOf("}");
  if (separator === -1) {
    return key;
  }

  const namespace = key.slice(1, separator);
  const localName = key.slice(separator + 1);
  if (namespace === XMLNS_NAMESPACE) {
    return null;
  }
  return namespace === XML_NAMESPACE ? `xml:${localName}` : localName;
}

function escapeXmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeXmlAttribute(value: string): string {
  return escapeXmlText(value)
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
