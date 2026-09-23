import { describe, expect, it } from "vitest";
import { loadConfig } from "../../../src/web/config.js";
import { unwrap, unwrapErr } from "../../helpers/result.js";

const BASE = { DATABASE_URL: "postgres://app:app@localhost:5432/rss2pub" };

describe("loadConfig", () => {
  it("applies defaults around the required DATABASE_URL", () => {
    const config = unwrap(loadConfig(BASE));
    expect(config).toMatchObject({
      origin: "http://localhost:8000",
      host: "localhost:8000",
      port: 8000,
      pollIntervalSeconds: 600,
      pollMaxIntervalSeconds: 1800,
      pollMaxBackoffSeconds: 86_400,
      schedulerTickMs: 60_000,
      registrationDailyLimit: 20,
      registrationTotalLimit: 1000,
      registrationAttemptsPerHour: 60,
      logLevel: "info",
      logFormat: "console",
    });
  });

  it("rejects poll intervals that are out of order", () => {
    expect(
      unwrapErr(
        loadConfig({
          ...BASE,
          POLL_INTERVAL_SECONDS: "600",
          POLL_MAX_INTERVAL_SECONDS: "300",
        }),
      ),
    ).toMatchObject({ key: "POLL_MAX_INTERVAL_SECONDS" });
    expect(
      unwrapErr(
        loadConfig({
          ...BASE,
          POLL_MAX_INTERVAL_SECONDS: "1800",
          POLL_MAX_BACKOFF_SECONDS: "900",
        }),
      ),
    ).toMatchObject({ key: "POLL_MAX_BACKOFF_SECONDS" });
  });

  it("requires DATABASE_URL", () => {
    expect(unwrapErr(loadConfig({}))).toMatchObject({ key: "DATABASE_URL" });
  });

  it("requires an explicit public origin in production", () => {
    expect(unwrapErr(loadConfig({ ...BASE, NODE_ENV: "production" }))).toMatchObject({ key: "ORIGIN" });
    expect(unwrapErr(loadConfig({ ...BASE, NODE_ENV: "production", ORIGIN: "http://bridge.example" })))
      .toMatchObject({ key: "ORIGIN" });
    expect(loadConfig({ ...BASE, NODE_ENV: "production", ORIGIN: "https://bridge.example" })).toMatchObject({ ok: true });
  });

  it("does not permit private-address fetches in production", () => {
    expect(unwrapErr(loadConfig({
      ...BASE,
      NODE_ENV: "production",
      ORIGIN: "https://bridge.example",
      ALLOW_PRIVATE_ADDRESS: "true",
    }))).toMatchObject({ key: "ALLOW_PRIVATE_ADDRESS" });
  });

  it("accepts an absolute HTTPS source URL for self-hosted forks", () => {
    expect(unwrap(loadConfig({ ...BASE, SOURCE_URL: "https://code.example/fork" })).sourceUrl)
      .toBe("https://code.example/fork");
    expect(unwrapErr(loadConfig({ ...BASE, SOURCE_URL: "javascript:alert(1)" }))).toMatchObject({ key: "SOURCE_URL" });
  });

  it("derives host from ORIGIN and rejects malformed origins", () => {
    const config = unwrap(loadConfig({ ...BASE, ORIGIN: "https://rss2.pub" }));
    expect(config.origin).toBe("https://rss2.pub");
    expect(config.host).toBe("rss2.pub");

    expect(unwrapErr(loadConfig({ ...BASE, ORIGIN: "nope" }))).toMatchObject({
      key: "ORIGIN",
    });
    expect(
      unwrapErr(loadConfig({ ...BASE, ORIGIN: "https://rss2.pub/sub" })),
    ).toMatchObject({ key: "ORIGIN" });
    expect(
      unwrapErr(loadConfig({ ...BASE, ORIGIN: "ftp://rss2.pub" })),
    ).toMatchObject({ key: "ORIGIN" });
  });

  it("rejects non-integer numeric settings", () => {
    expect(
      unwrapErr(loadConfig({ ...BASE, POLL_INTERVAL_SECONDS: "10.5" })),
    ).toMatchObject({ key: "POLL_INTERVAL_SECONDS" });
    expect(unwrapErr(loadConfig({ ...BASE, PORT: "0" }))).toMatchObject({
      key: "PORT",
    });
    expect(unwrapErr(loadConfig({ ...BASE, REGISTRATION_DAILY_LIMIT: "0" })))
      .toMatchObject({ key: "REGISTRATION_DAILY_LIMIT" });
    expect(unwrapErr(loadConfig({ ...BASE, REGISTRATION_TOTAL_LIMIT: "many" })))
      .toMatchObject({ key: "REGISTRATION_TOTAL_LIMIT" });
    expect(unwrapErr(loadConfig({ ...BASE, REGISTRATION_ATTEMPTS_PER_HOUR: "0" })))
      .toMatchObject({ key: "REGISTRATION_ATTEMPTS_PER_HOUR" });
  });

  it("parses LOG_LEVEL case-insensitively and rejects unknown levels", () => {
    expect(
      loadConfig({ ...BASE, LOG_LEVEL: "DEBUG" }),
    ).toMatchObject({ ok: true, value: { logLevel: "debug" } });
    expect(unwrapErr(loadConfig({ ...BASE, LOG_LEVEL: "verbose" }))).toMatchObject(
      { key: "LOG_LEVEL" },
    );
  });

  it("parses LOG_FORMAT case-insensitively and rejects unknown formats", () => {
    expect(
      loadConfig({ ...BASE, LOG_FORMAT: "JSON" }),
    ).toMatchObject({ ok: true, value: { logFormat: "json" } });
    expect(unwrapErr(loadConfig({ ...BASE, LOG_FORMAT: "xml" }))).toMatchObject({
      key: "LOG_FORMAT",
    });
  });
});
