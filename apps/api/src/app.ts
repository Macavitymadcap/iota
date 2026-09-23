import type { SQL } from "bun";
import { Hono } from "hono";
import { problemResponse, toProblem } from "./http/problem";
import type { DeviceRepository } from "./repositories/devices";
import { devicesRoutes } from "./routes/devices";

export type AppDependencies = {
  sql: SQL;
  devices: DeviceRepository;
};

export function createApp({ sql, devices }: AppDependencies) {
  const app = new Hono()
    .basePath("/api")
    .get("/health", async (c) => {
      try {
        await sql`SELECT 1`;
        return c.json({ status: "ok" as const });
      } catch {
        return problemResponse({ type: "about:blank", title: "Database unavailable", status: 503 });
      }
    })
    .route("/devices", devicesRoutes(devices));

  app.onError((error) => problemResponse(toProblem(error)));
  app.notFound(() => problemResponse({ type: "about:blank", title: "Not found", status: 404 }));

  return app;
}

export type AppType = ReturnType<typeof createApp>;
