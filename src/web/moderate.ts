import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig(process.env);
if (!config.ok) {
  console.error(`config error: ${config.error.key} — ${config.error.message}`);
  process.exitCode = 1;
} else {
  // The operator command must exit; the server's long-lived LISTEN worker
  // delivers any queued Delete after it is restarted or while it is running.
  const app = await createApp(config.value, { startQueue: false });
  try {
    const [command, value, ...rest] = process.argv.slice(2);
    switch (command) {
      case "reports":
        if (value !== undefined) throw new Error("usage: moderate reports");
        console.log(JSON.stringify(await app.reports.listOpen(), null, 2));
        break;
      case "close":
        if (!value) throw new Error("usage: moderate close <report-id>");
        console.log((await app.reports.close(value)) ? "Report closed." : "Report not found.");
        break;
      case "block": {
        if (!value || rest.length === 0) throw new Error("usage: moderate block <feed-url> <reason>");
        const result = await app.blockFeed.execute(value, rest.join(" "));
        if (!result.ok) throw new Error(`Invalid URL: ${value}`);
        console.log(result.value.removed ? "Feed blocked and actor removed." : "Feed blocked.");
        break;
      }
      case "remove": {
        if (!value) throw new Error("usage: moderate remove <handle>");
        const result = await app.unregisterFeed.execute(value);
        if (!result.ok) throw new Error(`Unknown or invalid handle: ${value}`);
        console.log(result.value.deletionPropagated ? "Actor removed." : "Actor removed locally; delivery failed.");
        break;
      }
      default:
        throw new Error("usage: moderate reports | close <report-id> | block <feed-url> <reason> | remove <handle>");
    }
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : String(cause));
    process.exitCode = 1;
  } finally {
    await app.shutdown();
  }
}
