import { expect, it } from "vitest";
import { createRecordAbuseReport } from "../../../src/application/record-abuse-report.js";
import { createInMemoryAbuseReportRepository } from "../../../src/infrastructure/persistence/in-memory-abuse-report-repository.js";

it("stores a valid Flag report once for operator review", async () => {
  const reports = createInMemoryAbuseReportRepository();
  const record = createRecordAbuseReport({ reports });
  const input = {
    id: "https://remote.test/flag/1",
    actorUri: "https://remote.test/actor",
    localHandle: "news_abc1234",
    objectUris: ["https://local.test/ap/actor/news_abc1234"],
    comment: "Spam",
    receivedAt: new Date("2026-09-30T00:00:00Z"),
  };
  expect((await record.execute(input)).ok).toBe(true);
  expect((await record.execute(input)).ok).toBe(true);
  expect(await reports.listOpen()).toHaveLength(1);
});
