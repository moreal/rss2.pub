import { AsyncLocalStorage } from "node:async_hooks";
import { Writable } from "node:stream";
import {
  configure,
  getConsoleSink,
  getStreamSink,
  jsonLinesFormatter,
  type LogLevel,
  reset,
  type Sink,
} from "@logtape/logtape";

/**
 * LogTape wiring for the whole process. Fedify logs under its own category
 * tree; application code logs under "rss2pub".
 */
export async function configureLogging(options?: {
  readonly appLevel?: LogLevel;
  readonly federationLevel?: LogLevel;
  /**
   * "console" (default) prints human-readable, possibly multi-line entries.
   * "json" emits one JSON object per line to stdout, which is what most log
   * collectors expect (a multi-line entry otherwise looks like several).
   */
  readonly format?: "console" | "json";
}): Promise<void> {
  const sink: Sink =
    options?.format === "json"
      ? getStreamSink(Writable.toWeb(process.stdout), {
          formatter: jsonLinesFormatter,
        })
      : getConsoleSink();
  await configure({
    reset: true,
    contextLocalStorage: new AsyncLocalStorage(),
    sinks: { console: sink },
    loggers: [
      {
        category: ["rss2pub"],
        lowestLevel: options?.appLevel ?? "info",
        sinks: ["console"],
      },
      {
        category: ["fedify"],
        lowestLevel: options?.federationLevel ?? "warning",
        sinks: ["console"],
      },
      { category: ["logtape", "meta"], lowestLevel: "warning", sinks: ["console"] },
    ],
  });
}

/** Test helper: returns LogTape to its unconfigured state. */
export async function resetLogging(): Promise<void> {
  await reset();
}
