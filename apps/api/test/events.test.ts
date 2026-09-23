import { describe, expect, test } from "bun:test";
import { CreateDevice, DeviceEvent } from "@iota/shared";
import { createApp } from "../src/app";
import { sql } from "../src/db";
import { createDeviceEventBus } from "../src/events/bus";
import { publishDeviceEvent } from "../src/events/channel";
import { createDeviceRepository } from "../src/repositories/devices";
import { waitFor } from "./helpers";

const repo = createDeviceRepository(sql);

/** Starts a bus that records every event, runs the test body, and always stops the bus. */
async function withBus(
  body: (received: DeviceEvent[], closed: () => boolean) => Promise<void>,
): Promise<void> {
  const bus = createDeviceEventBus(sql);
  const received: DeviceEvent[] = [];
  let isClosed = false;
  await bus.start();
  bus.subscribe({
    onEvent: (event) => received.push(event),
    onClose: () => {
      isClosed = true;
    },
  });
  try {
    await body(received, () => isClosed);
  } finally {
    await bus.stop();
  }
}

describe("device events", () => {
  test("a committed mutation produces exactly one event", async () => {
    await withBus(async (received) => {
      const light = await repo.create(CreateDevice.parse({ type: "light", name: "Lamp" }));

      await waitFor(() => received.length > 0);
      await Bun.sleep(50);

      expect(received).toEqual([{ kind: "created", device: light }]);
    });
  });

  test("a rolled-back transaction produces none", async () => {
    await withBus(async (received) => {
      const failing = sql.begin(async (tx) => {
        await publishDeviceEvent(tx, { kind: "resync" });
        throw new Error("roll back");
      });

      await expect(failing).rejects.toThrow("roll back");
      await Bun.sleep(100);
      expect(received).toEqual([]);
    });
  });

  test("deleting a device publishes its id", async () => {
    const light = await repo.create(CreateDevice.parse({ type: "light", name: "Lamp" }));

    await withBus(async (received) => {
      await repo.delete(light.id);
      await waitFor(() => received.length > 0);
      expect(received).toEqual([{ kind: "deleted", id: light.id }]);
    });
  });

  test("tells subscribers to resync after the listen connection drops", async () => {
    await withBus(async (received) => {
      // Kill the server side of our LISTEN connection; Bun reconnects and re-subscribes.
      await sql`
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND query ILIKE 'LISTEN%'
          AND pid <> pg_backend_pid()
      `;

      await waitFor(() => received.some((event) => event.kind === "resync"), 3000);
    });
  });

  test("stopping the bus closes its subscribers", async () => {
    let closed: () => boolean = () => false;
    await withBus(async (_received, isClosed) => {
      closed = isClosed;
    });
    expect(closed()).toBe(true);
  });
});

describe("GET /api/events", () => {
  test("streams committed changes to connected clients", async () => {
    const events = createDeviceEventBus(sql);
    await events.start();
    const app = createApp({ sql, devices: createDeviceRepository(sql), events });

    try {
      const res = await app.request("/api/events");
      expect(res.headers.get("content-type")).toContain("text/event-stream");
      if (!res.body) throw new Error("Expected a streaming body");
      const reader = res.body.getReader();

      await app.request("/api/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "camera", name: "Porch" }),
      });

      const decoder = new TextDecoder();
      let text = "";
      while (!text.includes("\n\n")) {
        const { value, done } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
      }

      const data = text.split("\n").find((line) => line.startsWith("data:"));
      expect(data).toBeDefined();
      const event = DeviceEvent.parse(JSON.parse((data ?? "").slice("data:".length)));
      expect(event).toMatchObject({ kind: "created", device: { name: "Porch" } });

      await reader.cancel();
    } finally {
      await events.stop();
    }
  });
});