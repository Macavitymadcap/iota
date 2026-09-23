import { describe, expect, test } from "bun:test";
import { CreateDevice, isActionSupported, LIMITS, UpdateDevice } from "./index";

describe("CreateDevice", () => {
  test("applies defaults so a type and name are enough", () => {
    expect(CreateDevice.parse({ type: "light", name: "Desk lamp" })).toEqual({
      type: "light",
      name: "Desk lamp",
      room: null,
      brightness: 100,
      colourTemperatureK: 4000,
      isOn: false,
    });
  });

  test("accepts initial operational state at registration", () => {
    const camera = CreateDevice.parse({ type: "camera", name: "Porch", isArmed: true });
    expect(camera.type === "camera" && camera.isArmed).toBe(true);
  });

  test("trims names and rejects blank ones", () => {
    expect(CreateDevice.parse({ type: "light", name: "  Lamp  " }).name).toBe("Lamp");
    expect(CreateDevice.safeParse({ type: "light", name: "   " }).success).toBe(false);
  });

  test.each([LIMITS.brightness.min, LIMITS.brightness.max])("accepts brightness %p", (b) => {
    expect(CreateDevice.safeParse({ type: "light", name: "x", brightness: b }).success).toBe(true);
  });

  test.each([LIMITS.brightness.min - 1, LIMITS.brightness.max + 1, 50.5])(
    "rejects brightness %p",
    (b) => {
      expect(CreateDevice.safeParse({ type: "light", name: "x", brightness: b }).success).toBe(
        false,
      );
    },
  );

  test("only accepts target temperatures in half-degree steps", () => {
    const parse = (t: number) =>
      CreateDevice.safeParse({ type: "thermostat", name: "Hall", targetTemperatureC: t }).success;
    expect(parse(20.5)).toBe(true);
    expect(parse(20.3)).toBe(false);
  });

  test("rejects unknown fields", () => {
    expect(CreateDevice.safeParse({ type: "light", name: "x", colour: "red" }).success).toBe(false);
  });
});

describe("UpdateDevice", () => {
  test("accepts a partial settings change", () => {
    expect(UpdateDevice.safeParse({ type: "light", brightness: 40 }).success).toBe(true);
  });

  test("rejects operational state, which only actions may change", () => {
    expect(UpdateDevice.safeParse({ type: "light", isOn: true }).success).toBe(false);
  });

  test("rejects settings belonging to another device type", () => {
    expect(UpdateDevice.safeParse({ type: "light", mode: "heat" }).success).toBe(false);
  });
});

describe("isActionSupported", () => {
  test("matches actions to device types", () => {
    expect(isActionSupported("camera", "arm")).toBe(true);
    expect(isActionSupported("light", "arm")).toBe(false);
  });
});
