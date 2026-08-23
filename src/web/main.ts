import { serve } from "@hono/node-server";
import { getLogger } from "@logtape/logtape";
import { configureLogging } from "../infrastructure/telemetry/logging.js";
import { startTelemetry } from "../infrastructure/telemetry/otel.js";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const configResult = loadConfig(process.env);
if (!configResult.ok) {
  console.error(
    `config error: ${configResult.error.key} — ${configResult.error.message}`,
  );
  process.exit(1);
}
const config = configResult.value;

await configureLogging({ appLevel: config.logLevel, format: config.logFormat });
const telemetry = startTelemetry({
  serviceName: "rss2pub",
  endpoint: process.env["OTEL_EXPORTER_OTLP_ENDPOINT"],
});
const logger = getLogger(["rss2pub", "main"]);

const app = await createApp(config);
const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  logger.info("listening on port {port} for {origin}", {
    port: info.port,
    origin: config.origin,
  });
});
app.scheduler.start();

async function shutdown(signal: string): Promise<void> {
  logger.info("shutting down ({signal})", { signal });
  server.close();
  await app.shutdown();
  await telemetry.shutdown();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
