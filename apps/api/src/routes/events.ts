import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { DeviceEventBus } from "../events/bus";

/** Keeps the connection inside Bun's 30-second idle timeout and the ALB's 60-second one. */
const HEARTBEAT_MS = 20_000;

export const eventsRoutes = (bus: DeviceEventBus) =>
  new Hono().get("/", (c) =>
    streamSSE(c, async (stream) => {
      let finish: () => void = () => {};
      const finished = new Promise<void>((resolve) => {
        finish = resolve;
      });

      // Subscribed before the first await, so nothing committed after the response starts is missed.
      const unsubscribe = bus.subscribe({
        onEvent: (event) => void stream.writeSSE({ data: JSON.stringify(event) }),
        onClose: () => finish(),
      });
      stream.onAbort(() => finish());

      // SSE comment lines are ignored by EventSource but count as traffic for idle timeouts.
      const heartbeat = setInterval(() => void stream.write(": heartbeat\n\n"), HEARTBEAT_MS);

      await finished;
      clearInterval(heartbeat);
      unsubscribe();
    }),
  );