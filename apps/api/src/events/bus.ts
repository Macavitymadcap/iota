import { DeviceEvent } from "@iota/shared";
import type { SQL } from "bun";
import { DEVICE_EVENTS_CHANNEL } from "./channel";

export type DeviceEventSubscriber = {
  onEvent(event: DeviceEvent): void;
  /** Called when the bus stops, so long-lived consumers such as SSE streams can end. */
  onClose(): void;
};

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/**
 * Holds one LISTEN per process and fans each notification out to in-process subscribers.
 * Every API instance runs its own bus, so a change made through any instance reaches the
 * clients connected to all of them.
 */
export function createDeviceEventBus(db: SQL) {
  const subscribers = new Set<DeviceEventSubscriber>();
  let subscription: Awaited<ReturnType<SQL["listen"]>> | null = null;
  let hasListened = false;

  const emit = (event: DeviceEvent): void => {
    for (const subscriber of subscribers) subscriber.onEvent(event);
  };

  const onNotify = (payload: string): void => {
    const result = DeviceEvent.safeParse(parseJson(payload));
    if (!result.success) {
      console.error("Ignoring malformed device event", payload);
      return;
    }
    emit(result.data);
  };

  // Runs on the first LISTEN and again after every reconnect. Notifications sent while the
  // connection was down are lost, so after a reconnect every client is told to refetch.
  const onListen = (): void => {
    if (hasListened) emit({ kind: "resync" });
    hasListened = true;
  };

  return {
    async start(): Promise<void> {
      subscription ??= await db.listen(DEVICE_EVENTS_CHANNEL, onNotify, onListen);
    },

    subscribe(subscriber: DeviceEventSubscriber): () => void {
      subscribers.add(subscriber);
      return () => {
        subscribers.delete(subscriber);
      };
    },

    async stop(): Promise<void> {
      await subscription?.unlisten();
      subscription = null;
      for (const subscriber of subscribers) subscriber.onClose();
      subscribers.clear();
    },
  };
}

export type DeviceEventBus = ReturnType<typeof createDeviceEventBus>;
