import { useQuery } from "@tanstack/react-query";
import { api } from "./api/client";
import { unwrap } from "./api/errors";

export function App() {
  const devices = useQuery({
    queryKey: ["devices"],
    queryFn: () => unwrap(api.devices.$get({ query: {} })),
  });

  if (devices.isPending) return <p>Loading devices…</p>;
  if (devices.isError) return <p role="alert">{devices.error.message}</p>;

  return (
    <main>
      <h1>iota</h1>
      <ul>
        {devices.data.map((device) => (
          <li key={device.id}>
            {device.name} ({device.type}, {device.room ?? "no room"})
          </li>
        ))}
      </ul>
    </main>
  );
}
