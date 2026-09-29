import { err, ok, type Result } from "../../shared/result.js";
import { Handle, type Handle as HandleValue } from "../feed/handle.js";

export type AbuseReport = {
  readonly id: string;
  readonly actorUri: string;
  readonly localHandle: HandleValue;
  readonly objectUris: readonly string[];
  readonly comment: string;
  readonly receivedAt: Date;
};

export type InvalidAbuseReport = { readonly type: "InvalidAbuseReport" };

function httpUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

export const AbuseReport = {
  create(raw: {
    readonly id: string;
    readonly actorUri: string;
    readonly localHandle: string;
    readonly objectUris: readonly string[];
    readonly comment: string;
    readonly receivedAt: Date;
  }): Result<AbuseReport, InvalidAbuseReport> {
    const id = httpUrl(raw.id);
    const actorUri = httpUrl(raw.actorUri);
    const handle = Handle.create(raw.localHandle);
    const objectUris = raw.objectUris.map(httpUrl);
    if (id === null || actorUri === null || !handle.ok
      || objectUris.length === 0 || objectUris.length > 16
      || objectUris.some((uri) => uri === null)
      || raw.comment.length > 4096
      || Number.isNaN(raw.receivedAt.getTime())) {
      return err({ type: "InvalidAbuseReport" });
    }
    return ok({
      id,
      actorUri,
      localHandle: handle.value,
      objectUris: objectUris.filter((uri): uri is string => uri !== null),
      comment: raw.comment,
      receivedAt: raw.receivedAt,
    });
  },
} as const;
