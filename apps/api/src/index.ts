import { createApp } from "./app";
import { config } from "./config";
import { sql } from "./db";
import { createDeviceRepository } from "./repositories/devices";

const app = createApp({ sql, devices: createDeviceRepository(sql) });

const server = Bun.serve({
  port: config.PORT,
  fetch: app.fetch,
  // Bun closes connections idle for 10 seconds by default. The SSE stream in step 5 sends a
  // heartbeat every 20 seconds, so the limit must sit comfortably above that.
  idleTimeout: 30,
});

console.log(`iota API listening on ${server.url}`);

// ECS sends SIGTERM before stopping a task; Ctrl+C sends SIGINT locally.
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  console.log(`${signal} received, shutting down`);
  await server.stop();
  await sql.close();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
