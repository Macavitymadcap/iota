import {
  CameraResolution,
  type Device,
  type DeviceType,
  LIMITS,
  ThermostatMode,
} from "@iota/shared";
import { defaultsFor, type FieldErrors } from "../lib/form";
import { capitalise } from "../lib/labels";
import { NumberField, SelectField, TextField } from "./fields";

type Props = {
  type: DeviceType;
  mode: "create" | "edit";
  device?: Device | undefined;
  errors: FieldErrors;
};

const STATE_OPTIONS = {
  power: [
    { value: "false", label: "Off" },
    { value: "true", label: "On" },
  ],
  armed: [
    { value: "false", label: "Disarmed" },
    { value: "true", label: "Armed" },
  ],
} as const;

export function DeviceFields({ type, mode, device, errors }: Props) {
  const values: Record<string, unknown> = device ?? defaultsFor(type);
  const value = (name: string): string => {
    const current = values[name];
    return current === null || current === undefined ? "" : String(current);
  };

  return (
    <>
      <TextField name="name" label="Name" defaultValue={value("name")} error={errors.name} />
      <TextField
        name="room"
        label="Room"
        placeholder="Optional"
        defaultValue={value("room")}
        error={errors.room}
      />

      {type === "light" && (
        <>
          <NumberField
            name="brightness"
            label="Brightness (%)"
            {...LIMITS.brightness}
            step={1}
            defaultValue={value("brightness")}
            error={errors.brightness}
          />
          <NumberField
            name="colourTemperatureK"
            label="Colour temperature (K)"
            {...LIMITS.colourTemperatureK}
            step={100}
            defaultValue={value("colourTemperatureK")}
            error={errors.colourTemperatureK}
          />
        </>
      )}

      {type === "thermostat" && (
        <>
          <SelectField
            name="mode"
            label="Mode"
            options={ThermostatMode.options.map((mode) => ({
              value: mode,
              label: capitalise(mode),
            }))}
            defaultValue={value("mode")}
            error={errors.mode}
          />
          <NumberField
            name="targetTemperatureC"
            label="Target temperature (°C)"
            {...LIMITS.targetTemperatureC}
            defaultValue={value("targetTemperatureC")}
            error={errors.targetTemperatureC}
          />
          {mode === "create" && (
            <NumberField
              name="currentTemperatureC"
              label="Current temperature (°C)"
              step={0.1}
              defaultValue={value("currentTemperatureC")}
              error={errors.currentTemperatureC}
            />
          )}
        </>
      )}

      {type === "camera" && (
        <>
          <SelectField
            name="resolution"
            label="Resolution"
            options={CameraResolution.options.map((resolution) => ({
              value: resolution,
              label: resolution,
            }))}
            defaultValue={value("resolution")}
            error={errors.resolution}
          />
          <NumberField
            name="motionSensitivity"
            label="Motion sensitivity"
            {...LIMITS.motionSensitivity}
            step={1}
            defaultValue={value("motionSensitivity")}
            error={errors.motionSensitivity}
          />
        </>
      )}

      {mode === "create" &&
        (type === "camera" ? (
          <SelectField
            name="isArmed"
            label="Initial state"
            options={STATE_OPTIONS.armed}
            defaultValue={value("isArmed")}
            error={errors.isArmed}
          />
        ) : (
          <SelectField
            name="isOn"
            label="Initial state"
            options={STATE_OPTIONS.power}
            defaultValue={value("isOn")}
            error={errors.isOn}
          />
        ))}
    </>
  );
}
