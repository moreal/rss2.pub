import { describe, expect, it } from "vitest";
import {
  AttributionCandidates,
  MAX_AUTHOR_CANDIDATES,
} from "../../../../src/domain/feed/author-uri.js";

describe("AttributionCandidates", () => {
  it("keeps canonical absolute HTTP(S) URLs in first-seen order", () => {
    const candidates = AttributionCandidates.fromRaw([
      " https://EXAMPLE.test:443/users/alice ",
      "https://example.test/users/alice",
      "http://example.test/users/bob",
      "/relative",
      "acct:carol@example.test",
      "javascript:alert(1)",
      "",
      "   ",
    ]);

    expect(AttributionCandidates.values(candidates)).toEqual([
      "https://example.test/users/alice",
      "http://example.test/users/bob",
    ]);
  });

  it("deduplicates before taking the first eight", () => {
    const raw = [
      "https://a.test/1",
      "https://a.test/1",
      ...Array.from(
        { length: 9 },
        (_, index) => `https://a.test/${index + 2}`,
      ),
    ];

    const values = AttributionCandidates.values(
      AttributionCandidates.fromRaw(raw),
    );
    expect(values).toHaveLength(MAX_AUTHOR_CANDIDATES);
    expect(values.at(-1)).toBe("https://a.test/8");
  });

  it("preserves canonical query strings and fragments", () => {
    const values = AttributionCandidates.values(
      AttributionCandidates.fromRaw([
        "https://EXAMPLE.test:443/users/alice?view=full#profile",
      ]),
    );

    expect(values).toEqual([
      "https://example.test/users/alice?view=full#profile",
    ]);
  });
});
