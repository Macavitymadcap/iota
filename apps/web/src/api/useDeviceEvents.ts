import { DeviceEvent } from "@iota/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { applyDeviceEvent, deviceKeys } from "./queries";

export type ConnectionStatus = "connecting" | "open" | "closed";

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/** Keeps the query cache in step with the server for as long as the app is open. */
export function useDeviceEvents(): ConnectionStatus {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  useEffect(() => {
    const source = new EventSource("/api/events");

    source.onopen = () => {
      setStatus("open");
      // Covers anything that changed before the stream connected, or while it was down.
      void queryClient.invalidateQueries({ queryKey: deviceKeys.all });
    };

    source.onerror = () => {
      // EventSource retries by itself unless the server refused the stream outright.
      setStatus(source.readyState === EventSource.CLOSED ? "closed" : "connecting");
    };

    source.onmessage = (message: MessageEvent<string>) => {
      const result = DeviceEvent.safeParse(parseJson(message.data));
      if (result.success) applyDeviceEvent(queryClient, result.data);
      else console.warn("Ignoring malformed device event", message.data);
    };

    return () => source.close();
  }, [queryClient]);

  return status;
}
