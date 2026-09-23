import type { Device, DeviceAction, DeviceType } from "@iota/shared";

export const TYPE_LABELS: Record<DeviceType, string> = {
  light: "Light",
  thermostat: "Thermostat",
  camera: "Camera",
};

export const TYPE_LABELS_PLURAL: Record<DeviceType, string> = {
  light: "Lights",
  thermostat: "Thermostats",
  camera: "Cameras",
};

export const ACTION_LABELS: Record<DeviceAction, string> = {
  "turn-on": "Turn on",
  "turn-off": "Turn off",
  arm: "Arm",
  disarm: "Disarm",
};

/** Whether the device is in its "active" state: on, or armed. */
export const isActive = (device: Device): boolean =>
  device.type === "camera" ? device.isArmed : device.isOn;

export const statusLabel = (device: Device): string => {
  if (device.type === "camera") return isActive(device) ? "Armed" : "Disarmed";
  return isActive(device) ? "On" : "Off";
};

export const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
