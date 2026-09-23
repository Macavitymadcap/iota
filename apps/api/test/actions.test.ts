import { describe, expect, test } from "bun:test";
import { ACTIONS_BY_TYPE, DeviceType } from "@iota/shared";
import { resolveAction } from "../src/actions";
import { UnsupportedAction } from "../src/errors";

describe("resolveAction", () => {
  test("resolves every action each type declares", () => {
    for (const type of DeviceType.options) {
      for (const action of ACTIONS_BY_TYPE[type]) {
        expect(() => resolveAction(type, action)).not.toThrow();
      }
    }
  });

  test("maps actions to absolute state changes", () => {
    expect(resolveAction("light", "turn-on")).toEqual({ type: "light", isOn: true });
    expect(resolveAction("thermostat", "turn-off")).toEqual({ type: "thermostat", isOn: false });
    expect(resolveAction("camera", "disarm")).toEqual({ type: "camera", isArmed: false });
  });

  test("rejects actions a type does not support", () => {
    expect(() => resolveAction("light", "arm")).toThrow(UnsupportedAction);
    expect(() => resolveAction("camera", "turn-on")).toThrow(UnsupportedAction);
  });
});
