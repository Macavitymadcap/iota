import { UpdateDevice } from "@iota/shared";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { deviceKeys, deviceQuery, useDeleteDevice, useUpdateDevice } from "../api/queries";
import { ActionButtons } from "../components/ActionButtons";
import { DeviceFields } from "../components/DeviceFields";
import { ErrorMessage } from "../components/ErrorMessage";
import { type FieldErrors, formToObject, problemFieldErrors, zodFieldErrors } from "../lib/form";
import { statusLabel, TYPE_LABELS } from "../lib/labels";

const route = getRouteApi("/devices/$id");

export function DeviceDetailPage() {
  const { id } = route.useParams();
  const { data: device } = useSuspenseQuery(deviceQuery(id));
  const update = useUpdateDevice(id);
  const remove = useDeleteDevice();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [errors, setErrors] = useState<FieldErrors>({});

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const parsed = UpdateDevice.safeParse({
      type: device.type,
      ...formToObject(new FormData(event.currentTarget)),
    });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error.issues));
      return;
    }

    setErrors({});
    update.mutate(parsed.data, { onError: (error) => setErrors(problemFieldErrors(error)) });
  }

  function onDelete(): void {
    if (!window.confirm(`Delete ${device.name}? This cannot be undone.`)) return;
    remove.mutate(id, {
      onSuccess: async () => {
        await navigate({ to: "/" });
        queryClient.removeQueries({ queryKey: deviceKeys.detail(id) });
      },
    });
  }

  return (
    <>
      <p>
        <Link to="/">← All devices</Link>
      </p>
      <h1>{device.name}</h1>

      <dl className="summary">
        <dt>Type</dt>
        <dd>{TYPE_LABELS[device.type]}</dd>
        <dt>Room</dt>
        <dd>{device.room ?? "None"}</dd>
        <dt>Status</dt>
        <dd>{statusLabel(device)}</dd>
        <dt>Last updated</dt>
        <dd>{new Date(device.updatedAt).toLocaleString("en-GB")}</dd>
      </dl>

      <ActionButtons device={device} />

      <h2>Settings</h2>
      {/* Keyed by updatedAt so the fields show fresh values whenever the device changes. */}
      <form key={device.updatedAt} onSubmit={onSubmit} noValidate className="form">
        <DeviceFields type={device.type} mode="edit" device={device} errors={errors} />
        {errors.form && <p className="error">{errors.form}</p>}
        {update.isError && <ErrorMessage error={update.error} />}
        {update.isSuccess && <p className="saved">Saved.</p>}
        <button type="submit" disabled={update.isPending}>
          Save settings
        </button>
      </form>

      <h2>Remove</h2>
      <button type="button" className="danger" onClick={onDelete} disabled={remove.isPending}>
        Delete device
      </button>
      {remove.isError && <ErrorMessage error={remove.error} />}
    </>
  );
}
