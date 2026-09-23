import { describe, expect, it } from "vitest";
import { createFindFeedByHandle } from "../../../src/application/find-feed-by-handle.js";
import { createInMemoryFeedRepository } from "../../../src/infrastructure/persistence/in-memory-feed-repository.js";
import { makeFeed } from "../../helpers/fakes.js";

describe("FindFeedByHandle", () => {
  it("finds an existing feed after parsing its public handle", async () => {
    const feeds = createInMemoryFeedRepository();
    const feed = makeFeed({ handle: "example" });
    await feeds.save(feed);

    expect(await createFindFeedByHandle({ feeds }).execute("EXAMPLE")).toEqual({
      ok: true,
      value: feed,
    });
  });

  it("rejects malformed handles before lookup", async () => {
    const feeds = createInMemoryFeedRepository();
    expect(await createFindFeedByHandle({ feeds }).execute("bad.handle")).toEqual({
      ok: false,
      error: { type: "InvalidHandle", raw: "bad.handle" },
    });
  });

  it("reports a well-formed handle with no feed", async () => {
    const feeds = createInMemoryFeedRepository();
    expect(await createFindFeedByHandle({ feeds }).execute("missing")).toEqual({
      ok: false,
      error: { type: "FeedNotFound" },
    });
  });
});
