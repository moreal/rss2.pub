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
      pollMaxBackoffSeconds: 86_400,
      schedulerTickMs: 60_000,
      noteMaxChars: 2000,
      teaserMaxChars: 200,
      logLevel: "info",
      logFormat: "console",
    });
  });

  it("requires DATABASE_URL", () => {
    expect(unwrapErr(loadConfig({}))).toMatchObject({ key: "DATABASE_URL" });
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
