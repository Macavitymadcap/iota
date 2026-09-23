import { CreateDevice, DeviceType } from "@iota/shared";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useCreateDevice } from "../api/queries";
import { DeviceFields } from "../components/DeviceFields";
import { ErrorMessage } from "../components/ErrorMessage";
import { type FieldErrors, formToObject, problemFieldErrors, zodFieldErrors } from "../lib/form";
import { TYPE_LABELS } from "../lib/labels";

export function NewDevicePage() {
  const [type, setType] = useState<DeviceType>("light");
  const [errors, setErrors] = useState<FieldErrors>({});
  const create = useCreateDevice();
  const navigate = useNavigate();

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const parsed = CreateDevice.safeParse({
      type,
      ...formToObject(new FormData(event.currentTarget)),
    });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error.issues));
      return;
    }

    setErrors({});
    create.mutate(parsed.data, {
      onSuccess: (device) => void navigate({ to: "/devices/$id", params: { id: device.id } }),
      onError: (error) => setErrors(problemFieldErrors(error)),
    });
  }

  return (
    <>
      <h1>Add a device</h1>
      <form onSubmit={onSubmit} noValidate className="form">
        <label className="field">
          <span>Type</span>
          <select
            value={type}
            onChange={(event) => {
              setType(DeviceType.parse(event.target.value));
              setErrors({});
            }}
          >
            {DeviceType.options.map((option) => (
              <option key={option} value={option}>
                {TYPE_LABELS[option]}
              </option>
            ))}
          </select>
        </label>

        {/* Keyed by type so switching type resets the fields to that type's defaults. */}
        <DeviceFields key={type} type={type} mode="create" errors={errors} />

        {errors.form && <p className="error">{errors.form}</p>}
        {create.isError && <ErrorMessage error={create.error} />}

        <button type="submit" disabled={create.isPending}>
          Add device
        </button>
      </form>
    </>
  );
}
