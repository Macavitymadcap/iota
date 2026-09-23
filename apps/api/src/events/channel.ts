import type { DeviceEvent } from "@iota/shared";
import type { SQL } from "bun";

export const DEVICE_EVENTS_CHANNEL = "device_events";

/**
 * Queues an event on the given transaction. Postgres delivers it to every listener when the
 * transaction commits and discards it on rollback, so clients never hear about a change that
 * didn't happen.
 */
export async function publishDeviceEvent(tx: SQL, event: DeviceEvent): Promise<void> {
  await tx.notify(DEVICE_EVENTS_CHANNEL, JSON.stringify(event));
}
