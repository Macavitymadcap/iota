import type {
  CreateDeviceInput,
  Device,
  DeviceAction,
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
  queryClient.setQueryData(deviceQuery(device.id).queryKey, device);
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
