import { AbuseReport, type InvalidAbuseReport } from "../domain/moderation/abuse-report.js";
import type { AbuseReportRepository } from "../domain/ports/abuse-report-repository.js";
import type { Result } from "../shared/result.js";

export function createRecordAbuseReport(deps: {
  readonly reports: AbuseReportRepository;
}) {
  return {
    async execute(raw: Parameters<typeof AbuseReport.create>[0]): Promise<Result<AbuseReport, InvalidAbuseReport>> {
      const report = AbuseReport.create(raw);
      if (!report.ok) return report;
      await deps.reports.save(report.value);
      return report;
    },
  };
}
