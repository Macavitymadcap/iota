import { describe, expect, test } from "bun:test";
import { CreateDevice, type CreateDeviceInput, LIMITS } from "@iota/shared";
import { sql } from "../src/db";
import { DeviceNotFound, TypeMismatch } from "../src/errors";
import { createDeviceRepository } from "../src/repositories/devices";

const repo = createDeviceRepository(sql);
const create = (input: CreateDeviceInput) => repo.create(CreateDevice.parse(input));

// Bun's queries are lazy thenables; wrapping them gives expect() a real promise to inspect.
const run = async (query: PromiseLike<unknown>): Promise<void> => {
  await query;
};

describe("create", () => {
  test("persists a light with defaults applied", async () => {
    const light = await create({ type: "light", name: "Desk lamp", room: "Study" });

    expect(light).toMatchObject({
      type: "light",
      name: "Desk lamp",
      room: "Study",
      isOn: false,
      brightness: 100,
      colourTemperatureK: 4000,
    });
    expect(await repo.findById(light.id)).toEqual(light);
  });

  test("returns thermostat temperatures as numbers", async () => {
    const thermostat = await create({
      type: "thermostat",
      name: "Hall",
      targetTemperatureC: 21.5,
      currentTemperatureC: 19,
    });

    expect(thermostat).toMatchObject({ targetTemperatureC: 21.5, currentTemperatureC: 19 });
  });

  test("stores initial operational state", async () => {
    const camera = await create({ type: "camera", name: "Porch", isArmed: true });
    expect(camera).toMatchObject({ isArmed: true });
  });
});

describe("list", () => {
  test("orders by room then name, with unassigned devices last, and filters", async () => {
    await create({ type: "light", name: "B lamp", room: "Lounge" });
    await create({ type: "light", name: "A lamp", room: "Lounge" });
    await create({ type: "camera", name: "Porch" });
    await create({ type: "thermostat", name: "Hall stat", room: "Hall" });

    const names = (devices: { name: string }[]) => devices.map((device) => device.name);

    expect(names(await repo.list())).toEqual(["Hall stat", "A lamp", "B lamp", "Porch"]);
    expect(names(await repo.list({ type: "light" }))).toEqual(["A lamp", "B lamp"]);
    expect(names(await repo.list({ room: "Hall" }))).toEqual(["Hall stat"]);
  });
});

describe("update", () => {
  test("changes only the given settings and advances updatedAt", async () => {
    const light = await create({ type: "light", name: "Lamp", room: "Study" });
    await Bun.sleep(5);

    const updated = await repo.update(light.id, { type: "light", brightness: 40 });

    expect(updated).toMatchObject({
      name: "Lamp",
      room: "Study",
      brightness: 40,
      colourTemperatureK: 4000,
    });
    expect(updated.updatedAt > light.updatedAt).toBe(true);
  });

  test("clears the room when given null", async () => {
    const light = await create({ type: "light", name: "Lamp", room: "Study" });
    expect((await repo.update(light.id, { type: "light", room: null })).room).toBeNull();
  });

  test("rejects a patch for a different device type", async () => {
    const light = await create({ type: "light", name: "Lamp" });
    await expect(repo.update(light.id, { type: "camera", resolution: "4k" })).rejects.toBeInstanceOf(
      TypeMismatch,
    );
  });

  test("throws DeviceNotFound for an unknown id", async () => {
    await expect(
      repo.update(crypto.randomUUID(), { type: "light", brightness: 10 }),
    ).rejects.toBeInstanceOf(DeviceNotFound);
  });
});

describe("updateState", () => {
  test("changes operational state", async () => {
    const light = await create({ type: "light", name: "Lamp" });
    expect(await repo.updateState(light.id, { type: "light", isOn: true })).toMatchObject({
      isOn: true,
    });
  });
});

describe("delete", () => {
  test("removes the device and its subtype row", async () => {
    const light = await create({ type: "light", name: "Lamp" });

    expect(await repo.delete(light.id)).toBe(true);
    expect(await repo.delete(light.id)).toBe(false);

    const [row]: { count: number }[] = await sql`SELECT count(*)::int AS count FROM lights`;
    expect(row?.count).toBe(0);
  });
});

describe("database constraints", () => {
  test("reject a subtype row attached to a device of another type", async () => {
    const thermostat = await create({ type: "thermostat", name: "Hall" });

    await expect(
      run(sql`
        INSERT INTO lights (device_id, is_on, brightness, colour_temperature_k)
        VALUES (${thermostat.id}, false, 100, 4000)
      `),
    ).rejects.toThrow();
  });

  test("agree with LIMITS on brightness", async () => {
    const light = await create({ type: "light", name: "Lamp" });
    const setBrightness = (value: number) =>
      run(sql`UPDATE lights SET brightness = ${value} WHERE device_id = ${light.id}`);

    await expect(setBrightness(LIMITS.brightness.max)).resolves.toBeUndefined();
    await expect(setBrightness(LIMITS.brightness.max + 1)).rejects.toThrow();
  });

  test("agree with LIMITS on half-degree temperature steps", async () => {
    const thermostat = await create({ type: "thermostat", name: "Hall" });
    const setTarget = (value: number) =>
      run(sql`
        UPDATE thermostats SET target_temperature_c = ${value} WHERE device_id = ${thermostat.id}
      `);

    await expect(setTarget(20.5)).resolves.toBeUndefined();
    await expect(setTarget(20.3)).rejects.toThrow();
  });
});