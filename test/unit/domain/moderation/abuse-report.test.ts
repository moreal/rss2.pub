import { expect, it } from "vitest";
import { AbuseReport } from "../../../../src/domain/moderation/abuse-report.js";

it("accepts a bounded report with local target references", () => {
  expect(AbuseReport.create({
    id: "https://remote.test/flag/1",
    actorUri: "https://remote.test/actor",
    localHandle: "news_abc1234",
    objectUris: ["https://local.test/ap/actor/news_abc1234"],
    comment: "Spam",
    receivedAt: new Date("2026-09-30T00:00:00Z"),
  })).toMatchObject({ ok: true, value: { comment: "Spam" } });
});

it("rejects a report without a target or with oversized comment", () => {
  const base = {
    id: "https://remote.test/flag/1",
    actorUri: "https://remote.test/actor",
    localHandle: "news_abc1234",
    objectUris: ["https://local.test/ap/actor/news_abc1234"],
    comment: "Spam",
    receivedAt: new Date(),
  };
  expect(AbuseReport.create({ ...base, objectUris: [] })).toMatchObject({ ok: false });
  expect(AbuseReport.create({ ...base, comment: "x".repeat(4097) })).toMatchObject({ ok: false });
});
