import { DeviceType } from "@iota/shared";
import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  type ErrorComponentProps,
  Link,
  notFound,
  Outlet,
} from "@tanstack/react-router";
import { z } from "zod";
import { ApiError } from "./api/errors";
import { deviceQuery, devicesQuery } from "./api/queries";
import { ErrorMessage } from "./components/ErrorMessage";
import { DeviceDetailPage } from "./pages/DeviceDetailPage";
import { DeviceListPage } from "./pages/DeviceListPage";
import { NewDevicePage } from "./pages/NewDevicePage";

type RouterContext = { queryClient: QueryClient };

function RootLayout() {
  return (
    <>
      <header className="site-header">
        <nav>
          <Link to="/" className="brand">
            iota
          </Link>
          <Link to="/devices/new">Add device</Link>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </>
  );
}

function RouteError({ error }: ErrorComponentProps) {
  return <ErrorMessage error={error} />;
}

function NotFoundPage() {
  return (
    <>
      <h1>Not found</h1>
      <p>
        That device doesn't exist, or has been deleted. <Link to="/">Back to all devices</Link>
      </p>
    </>
  );
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  errorComponent: RouteError,
  notFoundComponent: NotFoundPage,
});

// An unrecognised ?type= falls back to "all" rather than erroring.
const ListSearch = z.object({ type: DeviceType.optional().catch(undefined) });

const listRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: ListSearch,
  loaderDeps: ({ search }) => ({ type: search.type }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(devicesQuery(deps)),
  component: DeviceListPage,
});

const newDeviceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/devices/new",
  component: NewDevicePage,
});

const deviceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/devices/$id",
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(deviceQuery(params.id));
    } catch (error) {
      // A malformed id (400) and an unknown one (404) both mean there's no such device.
      if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
        throw notFound();
      }
      throw error;
    }
  },
  notFoundComponent: NotFoundPage,
  component: DeviceDetailPage,
});

const routeTree = rootRoute.addChildren([listRoute, newDeviceRoute, deviceRoute]);

export const createAppRouter = (queryClient: QueryClient) =>
  createRouter({
    routeTree,
    context: { queryClient },
    // Start loading on hover or focus; Query, not the router, decides whether data is fresh.
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: () => <p>Loading…</p>,
  });

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
