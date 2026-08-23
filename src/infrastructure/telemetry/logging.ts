import { AsyncLocalStorage } from "node:async_hooks";
import {
  configure,
  getConsoleSink,
  type LogLevel,
  reset,
} from "@logtape/logtape";

/**
 * LogTape wiring for the whole process. Fedify and BotKit log into the
 * "fedify"/"botkit" category trees; application code logs under "rss2pub".
 */
export async function configureLogging(options?: {
  readonly appLevel?: LogLevel;
  readonly federationLevel?: LogLevel;
}): Promise<void> {
  await configure({
    reset: true,
    contextLocalStorage: new AsyncLocalStorage(),
    sinks: { console: getConsoleSink() },
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
      {
        category: ["botkit"],
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
