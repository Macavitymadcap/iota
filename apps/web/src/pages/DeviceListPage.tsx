import { type Device, DeviceType } from "@iota/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { devicesQuery } from "../api/queries";
import { ActionButtons } from "../components/ActionButtons";
import { statusLabel, TYPE_LABELS, TYPE_LABELS_PLURAL } from "../lib/labels";

const route = getRouteApi("/");

const FILTERS = [
  { label: "All", type: undefined },
  ...DeviceType.options.map((type) => ({ label: TYPE_LABELS_PLURAL[type], type })),
];

/** Groups devices by room; the API already sorts by room with unassigned devices last. */
function groupByRoom(devices: readonly Device[]): [string, Device[]][] {
  const groups = new Map<string, Device[]>();
  for (const device of devices) {
    const room = device.room ?? "No room";
    groups.set(room, [...(groups.get(room) ?? []), device]);
  }
  return [...groups];
}

export function DeviceListPage() {
  const { type } = route.useSearch();
  const { data: devices } = useSuspenseQuery(devicesQuery({ type }));

  return (
    <>
      <h1>Devices</h1>

      <nav aria-label="Filter by type" className="filters">
        {FILTERS.map((filter) => (
          <Link
            key={filter.label}
            to="/"
            search={filter.type ? { type: filter.type } : {}}
            aria-current={filter.type === type ? "page" : undefined}
          >
            {filter.label}
          </Link>
        ))}
      </nav>

      {devices.length === 0 ? (
        <p>
          No devices yet. <Link to="/devices/new">Add one</Link>.
        </p>
      ) : (
        groupByRoom(devices).map(([room, roomDevices]) => (
          <section key={room} className="room">
            <h2>{room}</h2>
            <ul className="devices">
              {roomDevices.map((device) => (
                <li key={device.id} className="device">
                  <Link to="/devices/$id" params={{ id: device.id }}>
                    {device.name}
                  </Link>
                  <span>{TYPE_LABELS[device.type]}</span>
                  <span className="status">{statusLabel(device)}</span>
                  <ActionButtons device={device} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
