import { err, ok, type Result } from "../shared/result.js";

export type AppConfig = {
  /** Public federation origin, e.g. "https://rss2.pub". */
  readonly origin: string;
  /** Host part of origin — used to render @handle@host. */
  readonly host: string;
  readonly port: number;
  readonly databaseUrl: string;
  readonly pollIntervalSeconds: number;
  readonly pollMaxBackoffSeconds: number;
  readonly schedulerTickMs: number;
  readonly noteMaxChars: number;
  readonly teaserMaxChars: number;
  /** True when serving behind a reverse proxy that sets X-Forwarded-*. */
  readonly behindProxy: boolean;
  /** TEST ONLY (ALLOW_PRIVATE_ADDRESS=true): disables the SSRF guard. */
  readonly allowPrivateAddress: boolean;
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
  const pollMaxBackoffSeconds = integer(env, "POLL_MAX_BACKOFF_SECONDS", 86_400);
  if (!pollMaxBackoffSeconds.ok) return pollMaxBackoffSeconds;
  const schedulerTickMs = integer(env, "SCHEDULER_TICK_MS", 60_000);
  if (!schedulerTickMs.ok) return schedulerTickMs;
  const noteMaxChars = integer(env, "NOTE_MAX_CHARS", 2000);
  if (!noteMaxChars.ok) return noteMaxChars;
  const teaserMaxChars = integer(env, "TEASER_MAX_CHARS", 200);
  if (!teaserMaxChars.ok) return teaserMaxChars;

  return ok({
    origin: origin.origin,
    host: origin.host,
    port: port.value,
    databaseUrl,
    pollIntervalSeconds: pollIntervalSeconds.value,
    pollMaxBackoffSeconds: pollMaxBackoffSeconds.value,
    schedulerTickMs: schedulerTickMs.value,
    noteMaxChars: noteMaxChars.value,
    teaserMaxChars: teaserMaxChars.value,
    behindProxy: env["BEHIND_PROXY"] === "true",
    allowPrivateAddress: env["ALLOW_PRIVATE_ADDRESS"] === "true",
  });
}
