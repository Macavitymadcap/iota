import type {
  CreateDeviceInput,
  Device,
  DeviceAction,
  DeviceEvent,
  DeviceType,
  UpdateDeviceInput,
} from "@iota/shared";
import { type QueryClient, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { unwrap, unwrapEmpty } from "./errors";

export type DeviceListFilters = { type?: DeviceType | undefined };

const ALL = ["devices"] as const;

/** Hierarchical keys, so invalidating `lists()` refreshes every filtered list at once. */
export const deviceKeys = {
  all: ALL,
  lists: () => [...ALL, "list"] as const,
  list: (filters: DeviceListFilters) => [...ALL, "list", filters] as const,
  detail: (id: string) => [...ALL, "detail", id] as const,
};

export const devicesQuery = (filters: DeviceListFilters = {}) =>
  queryOptions({
    queryKey: deviceKeys.list(filters),
    queryFn: () => unwrap(api.devices.$get({ query: filters.type ? { type: filters.type } : {} })),
  });

export const deviceQuery = (id: string) =>
  queryOptions({
    queryKey: deviceKeys.detail(id),
    queryFn: () => unwrap(api.devices[":id"].$get({ param: { id } })),
  });

/**
 * The API returns the updated device from every write, so the detail cache is set directly
 * rather than refetched. Lists are invalidated, since a change can move a device between them.
 */
function storeDevice(queryClient: QueryClient, device: Device): void {
  const key = deviceQuery(device.id).queryKey;
  const cached = queryClient.getQueryData(key);
  // Responses and events can arrive in either order; never replace newer data with older.
  if (!cached || cached.updatedAt <= device.updatedAt) queryClient.setQueryData(key, device);
  void queryClient.invalidateQueries({ queryKey: deviceKeys.lists() });
}

export function useCreateDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDeviceInput) => unwrap(api.devices.$post({ json: input })),
    onSuccess: (device) => storeDevice(queryClient, device),
  });
}

export function useUpdateDevice(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateDeviceInput) =>
      unwrap(api.devices[":id"].$patch({ param: { id }, json: patch })),
    onSuccess: (device) => storeDevice(queryClient, device),
  });
}

export function useDeviceAction(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (action: DeviceAction) =>
      unwrap(api.devices[":id"].actions[":action"].$post({ param: { id, action } })),
    onSuccess: (device) => storeDevice(queryClient, device),
  });
}

export function useDeleteDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrapEmpty(api.devices[":id"].$delete({ param: { id } })),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: deviceKeys.lists() }),
  });
}

/** Applies a server-sent event to the cache; the API remains the only source of truth. */
export function applyDeviceEvent(queryClient: QueryClient, event: DeviceEvent): void {
  switch (event.kind) {
    case "created":
    case "updated":
      storeDevice(queryClient, event.device);
      break;
    case "deleted":
      // Marked stale but not refetched: a tab viewing the device keeps showing it rather than
      // flashing an error, and the tab that deleted it is already navigating away.
      void queryClient.invalidateQueries({
        queryKey: deviceKeys.detail(event.id),
        refetchType: "none",
      });
      void queryClient.invalidateQueries({ queryKey: deviceKeys.lists() });
      break;
    case "resync":
      void queryClient.invalidateQueries({ queryKey: deviceKeys.all });
      break;
  }
}
