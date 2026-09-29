import type { AbuseReport } from "../moderation/abuse-report.js";

export type AbuseReportRepository = {
  save(report: AbuseReport): Promise<void>;
  listOpen(): Promise<readonly AbuseReport[]>;
  close(id: string): Promise<boolean>;
};
