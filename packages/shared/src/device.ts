import { z } from "zod";

export const DeviceType = z.enum(["light", "thermostat", "camera"]);
export type DeviceType = z.infer<typeof DeviceType>;

export const ThermostatMode = z.enum(["heat", "cool", "auto"]);
export type ThermostatMode = z.infer<typeof ThermostatMode>;

export const CameraResolution = z.enum(["720p", "1080p", "4k"]);
export type CameraResolution = z.infer<typeof CameraResolution>;

/** Ranges shared by the API, the database CHECK constraints and the UI controls. */
export const LIMITS = {
  name: { min: 1, max: 100 },
  room: { min: 1, max: 100 },
  brightness: { min: 0, max: 100 },
  colourTemperatureK: { min: 2700, max: 6500 },
  targetTemperatureC: { min: 5, max: 30, step: 0.5 },
  motionSensitivity: { min: 1, max: 10 },
} as const;

const Name = z.string().trim().min(LIMITS.name.min).max(LIMITS.name.max);
const Room = z.string().trim().min(LIMITS.room.min).max(LIMITS.room.max).nullable();
const Brightness = z.int().min(LIMITS.brightness.min).max(LIMITS.brightness.max);
const ColourTemperatureK = z
  .int()
  .min(LIMITS.colourTemperatureK.min)
  .max(LIMITS.colourTemperatureK.max);
const TargetTemperatureC = z
  .number()
  .min(LIMITS.targetTemperatureC.min)
  .max(LIMITS.targetTemperatureC.max)
  .multipleOf(LIMITS.targetTemperatureC.step);
const CurrentTemperatureC = z.number().nullable();
const MotionSensitivity = z
  .int()
  .min(LIMITS.motionSensitivity.min)
  .max(LIMITS.motionSensitivity.max);

// Shapes grouped by role; every schema below is assembled from these parts.
const stored = { id: z.uuid(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() };
const common = { name: Name, room: Room };
const lightSettings = { brightness: Brightness, colourTemperatureK: ColourTemperatureK };
const thermostatSettings = { mode: ThermostatMode, targetTemperatureC: TargetTemperatureC };
const cameraSettings = { resolution: CameraResolution, motionSensitivity: MotionSensitivity };

// A device as the API returns it.
export const Light = z.object({
  type: z.literal("light"),
  ...stored,
  ...common,
  ...lightSettings,
  isOn: z.boolean(),
});

export const Thermostat = z.object({
  type: z.literal("thermostat"),
  ...stored,
  ...common,
  ...thermostatSettings,
  isOn: z.boolean(),
  currentTemperatureC: CurrentTemperatureC,
});

export const Camera = z.object({
  type: z.literal("camera"),
  ...stored,
  ...common,
  ...cameraSettings,
  isArmed: z.boolean(),
});

export const Device = z.discriminatedUnion("type", [Light, Thermostat, Camera]);

export type Light = z.infer<typeof Light>;
export type Thermostat = z.infer<typeof Thermostat>;
export type Camera = z.infer<typeof Camera>;
export type Device = z.infer<typeof Device>;

// Registration: every setting and the initial operational state are optional with defaults.
export const CreateDevice = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("light"),
    name: Name,
    room: Room.default(null),
    brightness: Brightness.default(100),
    colourTemperatureK: ColourTemperatureK.default(4000),
    isOn: z.boolean().default(false),
  }),
  z.strictObject({
    type: z.literal("thermostat"),
    name: Name,
    room: Room.default(null),
    mode: ThermostatMode.default("heat"),
    targetTemperatureC: TargetTemperatureC.default(20),
    currentTemperatureC: CurrentTemperatureC.default(null),
    isOn: z.boolean().default(false),
  }),
  z.strictObject({
    type: z.literal("camera"),
    name: Name,
    room: Room.default(null),
    resolution: CameraResolution.default("1080p"),
    motionSensitivity: MotionSensitivity.default(5),
    isArmed: z.boolean().default(false),
  }),
]);

/** What a client sends; defaults make most fields optional. */
export type CreateDeviceInput = z.input<typeof CreateDevice>;
/** What the server works with after parsing; defaults applied. */
export type CreateDevice = z.output<typeof CreateDevice>;

// Settings update: partial settings for one type. Operational state is deliberately absent,
// and strictObject rejects it, so on/off and arm/disarm can only change through actions.
export const UpdateDevice = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("light"),
    ...z.object({ ...common, ...lightSettings }).partial().shape,
  }),
  z.strictObject({
    type: z.literal("thermostat"),
    ...z.object({ ...common, ...thermostatSettings }).partial().shape,
  }),
  z.strictObject({
    type: z.literal("camera"),
    ...z.object({ ...common, ...cameraSettings }).partial().shape,
  }),
]);

export type UpdateDeviceInput = z.input<typeof UpdateDevice>;
export type UpdateDevice = z.output<typeof UpdateDevice>;
