type RssItem = {
  readonly guid?: string;
  readonly link?: string;
  readonly title?: string;
  readonly description?: string;
  readonly contentEncoded?: string;
  readonly pubDate?: string;
};

export function rssFixture(params: {
  readonly title: string;
  readonly description?: string;
  readonly link?: string;
  readonly items: readonly RssItem[];
}): string {
  const items = params.items
    .map((item) =>
      [
        "    <item>",
        item.guid !== undefined
          ? `      <guid isPermaLink="false">${item.guid}</guid>`
          : null,
        item.link !== undefined ? `      <link>${item.link}</link>` : null,
        item.title !== undefined ? `      <title>${item.title}</title>` : null,
        item.description !== undefined
          ? `      <description><![CDATA[${item.description}]]></description>`
          : null,
        item.contentEncoded !== undefined
          ? `      <content:encoded><![CDATA[${item.contentEncoded}]]></content:encoded>`
          : null,
        item.pubDate !== undefined
          ? `      <pubDate>${item.pubDate}</pubDate>`
          : null,
        "    </item>",
      ]
        .filter((line) => line !== null)
        .join("\n"),
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${params.title}</title>
    <link>${params.link ?? "https://example.com/"}</link>
    <description>${params.description ?? ""}</description>
${items}
  </channel>
</rss>`;
}

type AtomEntry = {
  readonly id?: string;
  readonly link?: string;
  readonly title?: string;
  readonly summary?: string;
  readonly contentHtml?: string;
  readonly updated?: string;
};

export function atomFixture(params: {
  readonly title: string;
  readonly subtitle?: string;
  readonly entries: readonly AtomEntry[];
}): string {
  const entries = params.entries
    .map((entry) =>
      [
        "  <entry>",
        entry.id !== undefined ? `    <id>${entry.id}</id>` : null,
        entry.link !== undefined
          ? `    <link rel="alternate" href="${entry.link}"/>`
          : null,
        entry.title !== undefined ? `    <title>${entry.title}</title>` : null,
        entry.summary !== undefined
          ? `    <summary type="html"><![CDATA[${entry.summary}]]></summary>`
          : null,
        entry.contentHtml !== undefined
          ? `    <content type="html"><![CDATA[${entry.contentHtml}]]></content>`
          : null,
        `    <updated>${entry.updated ?? "2026-07-01T00:00:00Z"}</updated>`,
        "  </entry>",
      ]
        .filter((line) => line !== null)
        .join("\n"),
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>urn:example:feed</id>
  <title>${params.title}</title>
  ${params.subtitle !== undefined ? `<subtitle>${params.subtitle}</subtitle>` : ""}
  <updated>2026-07-01T00:00:00Z</updated>
${entries}
</feed>`;
}
