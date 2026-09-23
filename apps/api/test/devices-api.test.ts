import { describe, expect, test } from "bun:test";
import { type CreateDeviceInput, Device, ProblemDetails } from "@iota/shared";
import { testClient } from "hono/testing";
import { createApp } from "../src/app";
import { sql } from "../src/db";
import { createDeviceEventBus } from "../src/events/bus";
import { createDeviceRepository } from "../src/repositories/devices";

const app = createApp({
  sql,
  devices: createDeviceRepository(sql),
  events: createDeviceEventBus(sql),
});
const client = testClient(app);

/** Raw request, for inputs the typed client would refuse to compile. */
const send = (method: string, path: string, body?: unknown) =>
  app.request(
    path,
    body === undefined
      ? { method }
      : {
          method,
          headers: { "Content-Type": "application/json" },
          body: typeof body === "string" ? body : JSON.stringify(body),
        },
  );

type AnyResponse = { status: number; headers: Headers; json(): Promise<unknown> };

async function expectProblem(res: AnyResponse, status: number): Promise<ProblemDetails> {
  expect(res.status).toBe(status);
  expect(res.headers.get("content-type")).toContain("application/problem+json");
  return ProblemDetails.parse(await res.json());
}

async function register(json: CreateDeviceInput): Promise<Device> {
  const res = await client.api.devices.$post({ json });
  expect(res.status).toBe(201);
  return Device.parse(await res.json());
}

describe("POST /api/devices", () => {
  test("registers a device with defaults and returns its location", async () => {
    const res = await client.api.devices.$post({ json: { type: "light", name: "Lamp" } });
    expect(res.status).toBe(201);

    const device = Device.parse(await res.json());
    expect(device).toMatchObject({ type: "light", isOn: false, brightness: 100 });
    expect(res.headers.get("location")).toBe(`/api/devices/${device.id}`);
  });

  test("rejects out-of-range settings with field-level errors", async () => {
    const res = await client.api.devices.$post({
      json: { type: "light", name: "Lamp", brightness: 150 },
    });
    const problem = await expectProblem(res, 400);
    expect(problem.errors?.map((error) => error.path)).toContain("brightness");
  });

  test("rejects an unknown device type", async () => {
    await expectProblem(await send("POST", "/api/devices", { type: "toaster", name: "x" }), 400);
  });

  test("rejects malformed JSON", async () => {
    await expectProblem(await send("POST", "/api/devices", "{"), 400);
  });
});

describe("GET /api/devices", () => {
  test("lists devices, filtered by type", async () => {
    await register({ type: "light", name: "Lamp" });
    await register({ type: "camera", name: "Porch" });

    const all = await client.api.devices.$get({ query: {} });
    expect(((await all.json()) as unknown[]).length).toBe(2);

    const cameras = await client.api.devices.$get({ query: { type: "camera" } });
    expect((await cameras.json()).map((device) => device.name)).toEqual(["Porch"]);
  });
});

describe("GET /api/devices/:id", () => {
  test("returns the device", async () => {
    const light = await register({ type: "light", name: "Lamp" });
    const res = await client.api.devices[":id"].$get({ param: { id: light.id } });
    expect(res.status).toBe(200);
    expect(Device.parse(await res.json())).toEqual(light);
  });

  test("returns 404 for an unknown id", async () => {
    const res = await client.api.devices[":id"].$get({ param: { id: crypto.randomUUID() } });
    await expectProblem(res, 404);
  });

  test("returns 400 for a malformed id", async () => {
    await expectProblem(await send("GET", "/api/devices/not-a-uuid"), 400);
  });
});

describe("PATCH /api/devices/:id", () => {
  test("updates settings", async () => {
    const light = await register({ type: "light", name: "Lamp" });
    const res = await client.api.devices[":id"].$patch({
      param: { id: light.id },
      json: { type: "light", brightness: 25 },
    });
    expect(res.status).toBe(200);
    expect(Device.parse(await res.json())).toMatchObject({ brightness: 25 });
  });

  test("rejects operational state, which only actions may change", async () => {
    const light = await register({ type: "light", name: "Lamp" });
    await expectProblem(
      await send("PATCH", `/api/devices/${light.id}`, { type: "light", isOn: true }),
      400,
    );
  });

  test("returns 409 when the type does not match the device", async () => {
    const light = await register({ type: "light", name: "Lamp" });
    const res = await client.api.devices[":id"].$patch({
      param: { id: light.id },
      json: { type: "camera", resolution: "4k" },
    });
    await expectProblem(res, 409);
  });
});

describe("POST /api/devices/:id/actions/:action", () => {
  test("performs a supported action", async () => {
    const light = await register({ type: "light", name: "Lamp" });
    const res = await client.api.devices[":id"].actions[":action"].$post({
      param: { id: light.id, action: "turn-on" },
    });
    expect(res.status).toBe(200);
    expect(Device.parse(await res.json())).toMatchObject({ isOn: true });
  });

  test("returns 422 for an action the device type does not support", async () => {
    const light = await register({ type: "light", name: "Lamp" });
    const res = await client.api.devices[":id"].actions[":action"].$post({
      param: { id: light.id, action: "arm" },
    });
    await expectProblem(res, 422);
  });

  test("returns 400 for an action that does not exist", async () => {
    const light = await register({ type: "light", name: "Lamp" });
    await expectProblem(await send("POST", `/api/devices/${light.id}/actions/explode`), 400);
  });
});

describe("DELETE /api/devices/:id", () => {
  test("deletes the device", async () => {
    const light = await register({ type: "light", name: "Lamp" });

    const res = await client.api.devices[":id"].$delete({ param: { id: light.id } });
    expect(res.status).toBe(204);

    const after = await client.api.devices[":id"].$get({ param: { id: light.id } });
    await expectProblem(after, 404);
  });

  test("returns 404 for an unknown id", async () => {
    const res = await client.api.devices[":id"].$delete({ param: { id: crypto.randomUUID() } });
    await expectProblem(res, 404);
  });
});

describe("GET /api/health", () => {
  test("reports ok when the database responds", async () => {
    const res = await client.api.health.$get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
