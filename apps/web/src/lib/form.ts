import { CreateDevice, type DeviceType } from "@iota/shared";
import { ApiError } from "../api/errors";

export type FieldErrors = Record<string, string>;

const NUMERIC_FIELDS = new Set([
  "brightness",
  "colourTemperatureK",
  "targetTemperatureC",
  "currentTemperatureC",
  "motionSensitivity",
]);

/**
 * Converts form fields into the shape the shared schemas expect. Blank numbers are omitted so
 * schema defaults apply; a blank room becomes null, which also lets an edit clear it.
 */
export function formToObject(formData: FormData): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [key, value] of formData) {
    if (typeof value !== "string") continue;
    if (key === "room") {
      values[key] = value.trim() === "" ? null : value;
    } else if (NUMERIC_FIELDS.has(key)) {
      if (value !== "") values[key] = Number(value);
    } else if (value === "true" || value === "false") {
      values[key] = value === "true";
    } else {
      values[key] = value;
    }
  }
  return values;
}

/** Client-side Zod issues, keyed by field. Issues with no path, such as unknown keys, go under "form". */
export function zodFieldErrors(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".") || "form";
    errors[key] ??= issue.message;
  }
  return errors;
}

/** Server-side validation errors from problem details, in the same shape. */
export function problemFieldErrors(error: unknown): FieldErrors {
  if (!(error instanceof ApiError)) return {};
  const errors: FieldErrors = {};
  for (const { path, message } of error.problem.errors ?? []) errors[path || "form"] ??= message;
  return errors;
}

/**
 * Registration defaults for a type, taken from the shared schema by parsing a minimal request,
 * so the form never repeats the defaults and can't drift from them.
 */
export function defaultsFor(type: DeviceType): Record<string, unknown> {
  const { name: _name, ...defaults } = CreateDevice.parse({ type, name: "-" });
  return defaults;
}
