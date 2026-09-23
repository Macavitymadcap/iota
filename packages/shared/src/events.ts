import { z } from "zod";
import { Device } from "./device";

export const DeviceEvent = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("created"), device: Device }),
  z.object({ kind: z.literal("updated"), device: Device }),
  z.object({ kind: z.literal("deleted"), id: z.uuid() }),
  // Sent when the server may have missed notifications; clients should refetch everything.
  z.object({ kind: z.literal("resync") }),
]);

export type DeviceEvent = z.infer<typeof DeviceEvent>;
