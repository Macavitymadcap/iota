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

export const statusLabel = (device: Device): string => {
  if (device.type === "camera") return device.isArmed ? "Armed" : "Disarmed";
  return device.isOn ? "On" : "Off";
};

export const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
