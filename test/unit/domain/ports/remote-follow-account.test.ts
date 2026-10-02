import { describe, expect, it } from "vitest";
import { RemoteFollowAccount } from "../../../../src/domain/ports/remote-follow-resolver.js";

describe("remote follow input budget", () => {
  it("rejects oversized input before attempting account resolution", () => {
    expect(RemoteFollowAccount.create("a".repeat(321) + "@remote.example")).toMatchObject({ ok: false, error: { type: "InvalidAccount" } });
  });
  it("still accepts a normal full account name", () => {
    expect(RemoteFollowAccount.create("@alice@remote.example")).toEqual({ ok: true, value: "alice@remote.example" });
  });
});
