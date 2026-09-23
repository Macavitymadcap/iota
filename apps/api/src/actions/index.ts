import { ACTIONS_BY_TYPE, type DeviceAction, type DeviceType } from "@iota/shared";
import { UnsupportedAction } from "../errors";
import type { StateChange } from "../repositories/devices";

type ActionsFor<T extends DeviceType> = (typeof ACTIONS_BY_TYPE)[T][number];

const HANDLERS = {
  light: {
    "turn-on": () => ({ type: "light", isOn: true }),
    "turn-off": () => ({ type: "light", isOn: false }),
  },
  thermostat: {
    "turn-on": () => ({ type: "thermostat", isOn: true }),
    "turn-off": () => ({ type: "thermostat", isOn: false }),
  },
  camera: {
    arm: () => ({ type: "camera", isArmed: true }),
    disarm: () => ({ type: "camera", isArmed: false }),
  },
} satisfies { [T in DeviceType]: Record<ActionsFor<T>, () => StateChange> };

/** Maps an action on a device type to the state change it causes, or throws UnsupportedAction. */
export function resolveAction(type: DeviceType, action: DeviceAction): StateChange {
  const handlers: Partial<Record<DeviceAction, () => StateChange>> = HANDLERS[type];
  const handler = handlers[action];
  if (!handler) throw new UnsupportedAction(type, action);
  return handler();
}
