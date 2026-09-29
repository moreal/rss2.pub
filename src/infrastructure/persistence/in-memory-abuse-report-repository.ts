import type { AbuseReport } from "../../domain/moderation/abuse-report.js";
import type { AbuseReportRepository } from "../../domain/ports/abuse-report-repository.js";

export function createInMemoryAbuseReportRepository(): AbuseReportRepository {
  const open = new Map<string, AbuseReport>();
  return {
    async save(report) { if (!open.has(report.id)) open.set(report.id, report); },
    async listOpen() { return [...open.values()]; },
    async close(id) { return open.delete(id); },
  };
}
