import { describe, expect, it } from "vitest";
import { parseAtom } from "../src/index.js";

const NS = "http://www.w3.org/2005/Atom";

describe("parseAtom XML boundary", () => {
  it("accepts only an Atom-namespaced feed root", () => {
    expect(parseAtom(`<feed xmlns="${NS}"><id>urn:f</id><title>F</title></feed>`).ok)
      .toBe(true);
    expect(parseAtom("<rss><channel/></rss>")).toMatchObject({
      ok: false,
      error: { type: "NotAtomFeed" },
    });
    expect(parseAtom("<feed><title>not namespaced</title></feed>")).toMatchObject({
      ok: false,
      error: { type: "NotAtomFeed" },
    });
  });

  it("rejects malformed XML and DOCTYPE", () => {
    expect(parseAtom(`<feed xmlns="${NS}"><entry></feed>`)).toMatchObject({
      ok: false,
      error: { type: "MalformedXml" },
    });
    expect(parseAtom(`<!DOCTYPE feed><feed xmlns="${NS}"/>`)).toMatchObject({
      ok: false,
      error: { type: "UnsafeXml" },
    });
  });

  it("enforces depth and node limits", () => {
    expect(parseAtom(`<feed xmlns="${NS}"><a><b/></a></feed>`, { maxDepth: 2 }))
      .toMatchObject({ ok: false, error: { type: "LimitExceeded", limit: "depth" } });
    expect(parseAtom(`<feed xmlns="${NS}"><a/><b/></feed>`, { maxNodes: 2 }))
      .toMatchObject({ ok: false, error: { type: "LimitExceeded", limit: "nodes" } });
  });

  it("counts comments toward node limits", () => {
    expect(parseAtom(`<feed xmlns="${NS}"><!-- node --></feed>`, { maxNodes: 1 }))
      .toMatchObject({ ok: false, error: { type: "LimitExceeded", limit: "nodes" } });
  });

  it("counts processing instructions toward node limits", () => {
    expect(parseAtom(`<feed xmlns="${NS}"><?node value?></feed>`, { maxNodes: 1 }))
      .toMatchObject({ ok: false, error: { type: "LimitExceeded", limit: "nodes" } });
  });
});
