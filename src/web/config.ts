import { isLogLevel, type LogLevel } from "@logtape/logtape";
import { err, ok, type Result } from "../shared/result.js";

export const LOG_FORMATS = ["console", "json"] as const;
export type LogFormat = (typeof LOG_FORMATS)[number];

function isLogFormat(value: string): value is LogFormat {
  return LOG_FORMATS.includes(value as LogFormat);
}

export type AppConfig = {
  /** Public federation origin, e.g. "https://rss2.pub". */
  readonly origin: string;
  /** Host part of origin — used to render @handle@host. */
  readonly host: string;
  readonly port: number;
  readonly databaseUrl: string;
  readonly pollIntervalSeconds: number;
  /** Ceiling the poll interval stretches to while a feed keeps not changing. */
  readonly pollMaxIntervalSeconds: number;
  readonly pollMaxBackoffSeconds: number;
  readonly schedulerTickMs: number;
  readonly noteMaxChars: number;
  readonly teaserMaxChars: number;
  /** True when serving behind a reverse proxy that sets X-Forwarded-*. */
  readonly behindProxy: boolean;
  /** TEST ONLY (ALLOW_PRIVATE_ADDRESS=true): disables the SSRF guard. */
  readonly allowPrivateAddress: boolean;
  /** Minimum level logged by application ("rss2pub") categories. */
  readonly logLevel: LogLevel;
  /** "console" for human-readable output, "json" for one JSON object per line. */
  readonly logFormat: LogFormat;
};

export type InvalidConfig = {
  readonly type: "InvalidConfig";
  readonly key: string;
  readonly message: string;
};

function integer(
  env: Record<string, string | undefined>,
  key: string,
  fallback: number,
): Result<number, InvalidConfig> {
  const raw = env[key];
  if (raw === undefined || raw.trim() === "") return ok(fallback);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    return err({
      type: "InvalidConfig",
      key,
      message: `expected a positive integer, got "${raw}"`,
    });
  }
  return ok(value);
}

export function loadConfig(
  env: Record<string, string | undefined>,
): Result<AppConfig, InvalidConfig> {
  const port = integer(env, "PORT", 8000);
  if (!port.ok) return port;

  const rawOrigin = env["ORIGIN"] ?? `http://localhost:${port.value}`;
  let origin: URL;
  try {
    origin = new URL(rawOrigin);
  } catch {
    return err({
      type: "InvalidConfig",
      key: "ORIGIN",
      message: `expected an absolute URL, got "${rawOrigin}"`,
    });
  }
  if (origin.protocol !== "http:" && origin.protocol !== "https:") {
    return err({
      type: "InvalidConfig",
      key: "ORIGIN",
      message: `expected http(s), got "${origin.protocol}"`,
    });
  }
  if (origin.pathname !== "/" || origin.search !== "" || origin.hash !== "") {
    return err({
      type: "InvalidConfig",
      key: "ORIGIN",
      message: "must not contain a path, query, or fragment",
    });
  }

  const databaseUrl = env["DATABASE_URL"];
  if (databaseUrl === undefined || databaseUrl.trim() === "") {
    return err({
      type: "InvalidConfig",
      key: "DATABASE_URL",
      message: "required (postgres:// connection string)",
    });
  }

  const pollIntervalSeconds = integer(env, "POLL_INTERVAL_SECONDS", 600);
  if (!pollIntervalSeconds.ok) return pollIntervalSeconds;
  const pollMaxIntervalSeconds = integer(env, "POLL_MAX_INTERVAL_SECONDS", 1800);
  if (!pollMaxIntervalSeconds.ok) return pollMaxIntervalSeconds;
  const pollMaxBackoffSeconds = integer(env, "POLL_MAX_BACKOFF_SECONDS", 86_400);
  if (!pollMaxBackoffSeconds.ok) return pollMaxBackoffSeconds;
  // PollPolicy.create enforces the same ordering, but only once createApp runs
  // and only by throwing. Catch it here so a bad environment is a config error
  // like every other one.
  if (pollMaxIntervalSeconds.value < pollIntervalSeconds.value) {
    return err({
      type: "InvalidConfig",
      key: "POLL_MAX_INTERVAL_SECONDS",
      message: `must be at least POLL_INTERVAL_SECONDS (${pollIntervalSeconds.value}), got ${pollMaxIntervalSeconds.value}`,
    });
  }
  if (pollMaxBackoffSeconds.value < pollMaxIntervalSeconds.value) {
    return err({
      type: "InvalidConfig",
      key: "POLL_MAX_BACKOFF_SECONDS",
      message: `must be at least POLL_MAX_INTERVAL_SECONDS (${pollMaxIntervalSeconds.value}), got ${pollMaxBackoffSeconds.value}`,
    });
  }
  const schedulerTickMs = integer(env, "SCHEDULER_TICK_MS", 60_000);
  if (!schedulerTickMs.ok) return schedulerTickMs;
  const noteMaxChars = integer(env, "NOTE_MAX_CHARS", 2000);
  if (!noteMaxChars.ok) return noteMaxChars;
  const teaserMaxChars = integer(env, "TEASER_MAX_CHARS", 200);
  if (!teaserMaxChars.ok) return teaserMaxChars;

  let logLevel: LogLevel = "info";
  const rawLogLevel = env["LOG_LEVEL"];
  if (rawLogLevel !== undefined && rawLogLevel.trim() !== "") {
    const normalized = rawLogLevel.trim().toLowerCase();
    if (!isLogLevel(normalized)) {
      return err({
        type: "InvalidConfig",
        key: "LOG_LEVEL",
        message: `expected one of trace|debug|info|warning|error|fatal, got "${rawLogLevel}"`,
      });
    }
    logLevel = normalized;
  }

  let logFormat: LogFormat = "console";
  const rawLogFormat = env["LOG_FORMAT"];
  if (rawLogFormat !== undefined && rawLogFormat.trim() !== "") {
    const normalized = rawLogFormat.trim().toLowerCase();
    if (!isLogFormat(normalized)) {
      return err({
        type: "InvalidConfig",
        key: "LOG_FORMAT",
        message: `expected one of ${LOG_FORMATS.join("|")}, got "${rawLogFormat}"`,
      });
    }
    logFormat = normalized;
  }

  return ok({
    origin: origin.origin,
    host: origin.host,
    port: port.value,
    databaseUrl,
    pollIntervalSeconds: pollIntervalSeconds.value,
    pollMaxIntervalSeconds: pollMaxIntervalSeconds.value,
    pollMaxBackoffSeconds: pollMaxBackoffSeconds.value,
    schedulerTickMs: schedulerTickMs.value,
    noteMaxChars: noteMaxChars.value,
    teaserMaxChars: teaserMaxChars.value,
    behindProxy: env["BEHIND_PROXY"] === "true",
    allowPrivateAddress: env["ALLOW_PRIVATE_ADDRESS"] === "true",
    logLevel,
    logFormat,
  });
}
