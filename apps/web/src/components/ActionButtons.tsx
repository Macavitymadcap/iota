import { ACTIONS_BY_TYPE, type Device, type DeviceAction } from "@iota/shared";
import { useDeviceAction } from "../api/queries";
import { ACTION_LABELS } from "../lib/labels";
import { ErrorMessage } from "./ErrorMessage";

/** The action whose result is the device's current state, which is disabled as a no-op. */
const currentStateAction = (device: Device): DeviceAction => {
  if (device.type === "camera") return device.isArmed ? "arm" : "disarm";
  return device.isOn ? "turn-on" : "turn-off";
};

export function ActionButtons({ device }: { device: Device }) {
  const action = useDeviceAction(device.id);
  const actions: readonly DeviceAction[] = ACTIONS_BY_TYPE[device.type];
  const current = currentStateAction(device);

  return (
    <div className="actions">
      {actions.map((name) => (
        <button
          key={name}
          type="button"
          disabled={action.isPending || name === current}
          onClick={() => action.mutate(name)}
        >
          {ACTION_LABELS[name]}
        </button>
      ))}
      {action.isError && <ErrorMessage error={action.error} />}
    </div>
  );
}
