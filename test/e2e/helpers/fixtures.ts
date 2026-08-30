type AtomAuthor = {
  readonly name: string;
  readonly uri?: string;
  readonly email?: string;
};

type AtomEntry = {
  readonly id?: string;
  readonly link?: string;
  readonly title?: string;
  readonly summary?: string;
  readonly contentHtml?: string;
  readonly published?: string;
  readonly updated?: string;
  readonly language?: string;
  readonly authors?: readonly AtomAuthor[];
};

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

function atomAuthorFixture(author: AtomAuthor): string {
  return [
    "    <author>",
    `      <name>${escapeXmlText(author.name)}</name>`,
    author.uri !== undefined
      ? `      <uri>${escapeXmlText(author.uri)}</uri>`
      : null,
    author.email !== undefined
      ? `      <email>${escapeXmlText(author.email)}</email>`
      : null,
    "    </author>",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export function atomFixture(params: {
  readonly title: string;
  readonly subtitle?: string;
  readonly link?: string;
  readonly language?: string;
  readonly entries: readonly AtomEntry[];
}): string {
  const entries = params.entries
    .map((entry) =>
      [
        `  <entry${entry.language !== undefined ? ` xml:lang="${escapeXmlAttribute(entry.language)}"` : ""}>`,
        entry.id !== undefined
          ? `    <id>${escapeXmlText(entry.id)}</id>`
          : null,
        entry.link !== undefined
          ? `    <link rel="alternate" href="${escapeXmlAttribute(entry.link)}"/>`
          : null,
        entry.title !== undefined
          ? `    <title>${escapeXmlText(entry.title)}</title>`
          : null,
        entry.summary !== undefined
          ? `    <summary type="html">${escapeXmlText(entry.summary)}</summary>`
          : null,
        entry.contentHtml !== undefined
          ? `    <content type="html">${escapeXmlText(entry.contentHtml)}</content>`
          : null,
        ...(entry.authors ?? []).map(atomAuthorFixture),
        entry.published !== undefined
          ? `    <published>${escapeXmlText(entry.published)}</published>`
          : null,
        `    <updated>${escapeXmlText(entry.updated ?? "2026-07-01T00:00:00Z")}</updated>`,
        "  </entry>",
      ]
        .filter((line) => line !== null)
        .join("\n"),
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"${params.language !== undefined ? ` xml:lang="${escapeXmlAttribute(params.language)}"` : ""}>
  <id>urn:example:feed</id>
  <title>${escapeXmlText(params.title)}</title>
  ${params.subtitle !== undefined ? `<subtitle>${escapeXmlText(params.subtitle)}</subtitle>` : ""}
  ${params.link !== undefined ? `<link rel="alternate" href="${escapeXmlAttribute(params.link)}"/>` : ""}
  <updated>2026-07-01T00:00:00Z</updated>
${entries}
</feed>`;
}
