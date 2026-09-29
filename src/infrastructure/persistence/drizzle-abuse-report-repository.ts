import { eq, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { AbuseReportRepository } from "../../domain/ports/abuse-report-repository.js";
import { Handle } from "../../domain/feed/handle.js";
import { abuseReports } from "./schema.js";

export function createDrizzleAbuseReportRepository(db: PostgresJsDatabase): AbuseReportRepository {
  return {
    async save(report) {
      await db.insert(abuseReports).values({
        id: report.id,
        actorUri: report.actorUri,
        localHandle: report.localHandle,
        objectUris: [...report.objectUris],
        comment: report.comment,
        receivedAt: report.receivedAt,
      }).onConflictDoNothing();
    },
    async listOpen() {
      const rows = await db.select().from(abuseReports)
        .where(isNull(abuseReports.closedAt)).orderBy(abuseReports.receivedAt);
      return rows.flatMap((row) => {
        const handle = Handle.create(row.localHandle);
        return handle.ok ? [{
          id: row.id,
          actorUri: row.actorUri,
          localHandle: handle.value,
          objectUris: row.objectUris,
          comment: row.comment,
          receivedAt: row.receivedAt,
        }] : [];
      });
    },
    async close(id) {
      const rows = await db.update(abuseReports).set({ closedAt: new Date() })
        .where(eq(abuseReports.id, id)).returning({ id: abuseReports.id });
      return rows.length > 0;
    },
  };
}
