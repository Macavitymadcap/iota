import { z } from "zod";
import type { DeviceType } from "./device";

/** Every action name the API understands, used to validate the `:action` route param. */
export const DeviceAction = z.enum(["turn-on", "turn-off", "arm", "disarm"]);
export type DeviceAction = z.infer<typeof DeviceAction>;

/** Which actions each device type supports; anything else is a 422. */
export const ACTIONS_BY_TYPE = {
  light: ["turn-on", "turn-off"],
  thermostat: ["turn-on", "turn-off"],
  camera: ["arm", "disarm"],
} as const satisfies Record<DeviceType, readonly DeviceAction[]>;

export const isActionSupported = (type: DeviceType, action: DeviceAction): boolean =>
  (ACTIONS_BY_TYPE[type] as readonly DeviceAction[]).includes(action);
