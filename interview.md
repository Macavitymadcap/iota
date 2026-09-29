# iota: interview notes

Talking points gathered from planning and building iota, grouped by area,
followed by likely questions with answer outlines and notes on how the
application could be developed further. The README covers the same
decisions for a reader; these notes cover the reasoning and alternatives
an interviewer is likely to probe.

## Stack choices

| Choice | Reason | Alternative considered |
| --- | --- | --- |
| Bun | Runtime, package manager, workspaces, test runner and Postgres client in one tool | Node with pnpm and Vitest |
| Hono | Small, typed routing; its RPC client gives end-to-end types with no code generation | Express or Fastify with OpenAPI generation |
| Postgres | Relational constraints suit a typed device model; `LISTEN`/`NOTIFY` doubles as the event bus | SQLite, which has no cross-process notifications |
| `Bun.sql`, raw SQL | Explicit queries with no ORM layer to explain | Drizzle or Kysely |
| Zod v4 | One schema drives validation on both sides, row parsing and client types | Valibot or ArkType |
| TanStack Query | Server state belongs in a cache, not a hand-rolled store | Redux or context with `useReducer` |
| TanStack Router | Typed params, typed search params, and loaders that pair with Query | React Router |
| SSE | Updates only flow one way; plain HTTP; built-in reconnection | WebSockets or polling |
| Open Props | Design tokens and dark mode without a component library | Tailwind or a component library |
| Biome | One tool and config for linting and formatting | ESLint with Prettier |
| Terraform | Declarative, widely used in public sector delivery, and the tool I know best | CDK |

## Data model

### Class table inheritance

- A `devices` base table plus one table per device type, keyed one-to-one
  on the device id.
- `devices` has `UNIQUE (id, type)`. Each subtype table has a `type`
  column fixed by `CHECK (type = 'light')` and a composite foreign key
  `(device_id, type) REFERENCES devices (id, type)`. That is what stops a
  light row attaching to a thermostat at the database level; the `type`
  column exists only to make that foreign key possible.
- "Every device has exactly one subtype row" cannot be expressed with
  plain constraints. The repository guarantees it by inserting both rows
  in one transaction.
- Costs: two-table writes, joins on every read, a migration per new
  device type. JSONB would be more flexible but gives up per-type
  constraints.

### Constraints and defaults

- Ranges are `CHECK` constraints mirroring `LIMITS` in `@iota/shared`.
  Zod rejects bad input first; the constraints are the backstop for
  anything that writes to the database directly. Tests check the two
  agree at the boundaries.
- The half-degree temperature rule is
  `target_temperature_c * 2 = trunc(target_temperature_c * 2)`, and
  `multipleOf(0.5)` in Zod. Multiples of 0.5 are exact in binary floating
  point, so the Zod check is reliable.
- Subtype columns have `NOT NULL` but no defaults. Defaults live only in
  the `CreateDevice` schema; duplicating them in SQL would let them drift
  apart silently. The registration form reads the same defaults by
  parsing a minimal request.
- `updated_at` is set explicitly by the repository in the same
  transaction as the subtype update, rather than by a trigger, so the
  behaviour is visible in the code.

### Migrations

- Numbered plain SQL files, applied in filename order by a ~40-line
  script. Each file and its `schema_migrations` record are written in one
  transaction, so a failed migration leaves no record and can be fixed
  and rerun.
- `sql.unsafe()` is used because it accepts multiple statements when
  there are no parameters; safe because the files are our own.
- No advisory lock against concurrent runners, because the pipeline runs
  exactly one migration task per release. Adding one would need
  `sql.reserve()` so the lock and the migrations share a connection.

## API design

### PATCH versus actions

- The rule: PATCH changes persistent settings, actions change operational
  state. Registration is the one exception, because a device can join
  the system already running.
- Likely challenge: "why is turning a light off not just
  `PATCH { isOn: false }`?" Answer: commands are explicit and validated
  per type, there is one place to reject an inapplicable command, and an
  audit log of actions would be trivial to add. The cost is two update
  paths.
- Actions go through a handler map keyed by type then action. A
  `satisfies` clause ties the map to `ACTIONS_BY_TYPE` in the shared
  package, so the two lists cannot disagree without a compile error.
- Actions set absolute states, so they are idempotent. A relative action
  such as `toggle` would take the current device as input and would not
  be idempotent.

### Validation and status codes

- Update and create schemas are `strictObject`s, so unknown keys are
  rejected rather than silently dropped. That is what makes an `isOn` in
  a PATCH body a 400.
- The PATCH body carries `type` because the validator runs before the
  handler knows which device the request is for. Declarative validation
  keeps `hc` inference working. A mismatch with the stored device is a
  409.
- 400 for a malformed id: the request is invalid before any lookup, and
  it stops Postgres receiving a value it cannot cast to `uuid`, which
  would otherwise surface as a 500.
- 400 for an unknown action name versus 422 for a real action on the
  wrong type: "that does not exist" versus "that exists but does not
  apply here".
- The `validate` wrapper throws instead of responding, so every error
  from any source is formatted in one `onError` handler.

### Problem details

- RFC 9457 `application/problem+json` for every error.
- `urn:iota:problem:*` type values are stable identifiers a client can
  switch on; the RFC only requires a URI, not a resolvable URL.
- Unknown errors are logged but return a generic 500, so SQL errors and
  stack traces never leak.
- Domain errors (`DeviceNotFound`, `TypeMismatch`, `UnsupportedAction`)
  carry no HTTP knowledge; the mapping lives in one file.

### Repository

- A factory taking the connection pool rather than importing it, so
  tests and scripts pass their own connection and nothing depends on
  module-level state.
- `update` locks the base row with `SELECT ... FOR UPDATE` before
  checking the type, so a concurrent delete cannot slip in between the
  check and the write.
- List filters use `(${x}::type IS NULL OR column = ${x})`: one fixed,
  fully parameterised query for every filter combination, with no
  dynamic SQL.
- Postgres `numeric` arrives as a string to preserve precision; values
  here fit a double, so they are converted with `Number`.
- Every row goes through `Device.parse`, so the rest of the API only sees
  validated objects even though `Bun.sql` returns untyped rows.
- Every write reads the device back inside its transaction; that device
  becomes both the response and the event payload.

### Configuration and lifecycle

- Startup validates the environment with Zod and fails with a clear
  message, rather than failing on the first query with a confusing
  connection error to Bun's defaults.
- `new SQL()` with no arguments reads `DATABASE_URL` or the discrete
  `PG*` variables, which is how RDS-managed credentials arrive in ECS.
- Graceful shutdown on `SIGTERM`: stop the event bus (which ends open SSE
  streams), then `server.stop()` (waits for in-flight requests), then
  close the pool. Without closing SSE streams first, shutdown would hang
  until ECS killed the task.

## Real-time updates

### Transactional notifications

- `tx.notify()` inside the write's transaction: Postgres delivers on
  commit and discards on rollback, so clients never hear about a change
  that did not happen. No "publish after commit" step and no outbox
  table.
- Publishing is a stateless function the repository imports. The
  original design put `publish` on the event bus; it moved out because it
  needs no state, which kept the repository's signature unchanged.
- The `NOTIFY` payload limit is just under 8000 bytes by default. A
  serialised device is well under 1 KB, so events carry the whole device.
- Discriminator is `kind`, not `type`, because the device inside the
  event already uses `type`.

### The listening side

- One `LISTEN` per process; Bun runs all listeners on one dedicated
  connection. The bus fans out to in-process subscribers.
- If the listening connection drops, Bun reconnects with exponential
  backoff and re-subscribes, but notifications sent in between are lost.
  The `onlisten` callback runs on every reconnect, and the bus uses it to
  emit `resync`.
- A throwing `listen` callback is reported as an uncaught exception, so
  JSON parsing in the callback is wrapped.
- Works across multiple API instances with no extra infrastructure; the
  database is the broker.

### SSE details

- Heartbeat comment every 20 seconds. Bun's default idle timeout is 10
  seconds (raised to 30); an ALB's default is 60.
- The route subscribes before its first `await`, so nothing committed
  after the response starts is missed.
- The stream ends either when the client disconnects or when the bus
  closes during shutdown; both resolve one promise, so cleanup is in one
  place.
- No event replay. The browser refetches on every (re)connect, which is
  simpler than persisting events and cheap at this scale.

## Frontend

### The typed contract

- `import type { AppType } from "@iota/api"` is the whole cross-workspace
  contract. `verbatimModuleSyntax` guarantees it is erased.
- Checked three ways: a deliberate bad `$post` fails typecheck, importing
  `createApp` fails lint, and grepping the built bundle for SQL finds
  nothing.
- Trade-off: the web tsconfig includes Bun's types because TypeScript
  type-checks the API's source when following `AppType`. Frontend code
  could therefore reference `process` without a type error.
- Biome cannot restrict to type-only imports (an open feature request);
  `allowImportNames: ["AppType"]` plus `verbatimModuleSyntax` gives the
  same guarantee in two halves.
- Both apps must use the same Hono version, because `hc`'s types are
  computed from the server's Hono types.

### Server state

- `hc` returns responses like `fetch` and does not throw; TanStack Query
  only treats a query as failed if its function throws. `unwrap` bridges
  the two and turns problem details into a typed `ApiError`, with a
  fallback for non-JSON error pages from proxies.
- Hierarchical query keys (`devices`, `devices/list/{filters}`,
  `devices/detail/{id}`) so invalidating lists refreshes every filtered
  list at once.
- Writes return the device, so mutations set the detail cache directly
  and invalidate lists.
- Newer-wins: a device reaches the cache from both the mutation response
  and the event stream, in either order, so the cache rejects a device
  older than the cached copy by `updatedAt`. ISO timestamps in UTC sort
  correctly as strings.
- Own events are not filtered out; writing the same device twice is
  harmless and simpler than sending a client id with every request.
- Router loaders use `ensureQueryData`, with `defaultPreloadStaleTime: 0`
  so the router always calls the loader and Query alone decides
  freshness.
- `staleTime` of 60 seconds as a safety net for a stalled stream; the
  stream is the primary freshness mechanism.

### Delete races

- Deleting from the detail page navigates away first and only then
  removes the cache entry; removing it while the page is mounted would
  refetch, get a 404 and flash an error.
- A `deleted` event marks the detail entry stale with
  `refetchType: "none"`, so another window viewing that device keeps
  showing it rather than erroring.

### Routing

- Code-based routes: with three routes, file-based generation adds
  machinery without saving effort.
- `getRouteApi("/devices/$id")` gives typed params without importing the
  route object, avoiding a circular import between pages and the router.
- Static segments outrank dynamic ones, so `/devices/new` is never taken
  for an id.
- The type filter is a validated search param with `.catch(undefined)`,
  so `?type=toaster` shows everything rather than erroring, and the
  filter survives refresh and is shareable.
- A 400 or 404 from the detail loader becomes `notFound()`.

### Forms

- Uncontrolled inputs read with `FormData` on submit, validated with the
  shared schema before any request. Only the type selector is
  controlled, because it decides which fields render. A deviation from
  the design document, which planned controlled inputs.
- `onSubmit` with `preventDefault` rather than a React 19 form `action`,
  because form actions reset uncontrolled inputs after every submission,
  including failed validation.
- `noValidate` so the shared schema is the only source of error
  messages.
- Client and server field errors share one shape, rendered identically.
- The settings form is keyed by `updatedAt` so it shows fresh values
  after any change, at the cost of discarding unsaved edits if another
  window changes the device.
- The type select is keyed so switching type resets fields to that
  type's defaults.

### Styling

- Open Props tokens and normalise; dark mode follows the system with no
  extra CSS.
- Logical properties (`inline-size`, `padding-block`) so layout would
  adapt to right-to-left languages.
- Labels wrap their controls, so each field is accessible and Biome's
  accessibility rules can see the control.

## Testing

- Integration tests run against a real database because the riskiest
  code is the SQL, constraints and notification behaviour, which mocks
  would hide.
- The preload refuses to run unless the database name ends in `_test`.
- The preload uses dynamic imports because static imports are hoisted and
  would create the pool before the environment variable is changed.
- Truncate with `CASCADE` before each test; files run serially.
- Typed `testClient` for valid requests, which also proves the RPC types
  work before any React exists; raw `app.request` for invalid inputs the
  typed client will not compile.
- The resync test calls `pg_terminate_backend` on the real `LISTEN`
  connection instead of mocking a disconnect.
- The rollback test proves a notification inside a rolled-back
  transaction is never delivered.

## Problems hit during the build

These make good answers to "tell me about something that went wrong".

| Problem | Cause | Fix |
| --- | --- | --- |
| `zsh: no matches found: @iota/shared@workspace:*` | zsh treats `*` as a glob | Quote package specifiers |
| `docker compose` flag errors, then a missing socket | Homebrew Docker CLI with no Compose plugin and no running runtime | Compose plugin via Homebrew, then Colima |
| `AppType` not exported | `@iota/api` package had no `exports` entry, so everything downstream became `unknown` | Add `exports` pointing at `src/app.ts` |
| Blank page with "waiting for 1 other script" | `bun --filter` respects dependency order; web depends on api, whose dev server never exits | `bun run --parallel`, which ignores dependency order |
| `ERR_POSTGRES_CONNECTION_REFUSED` | Colima VM stopped | `colima start`; optionally a login service |

## Deviations from the original design

| Planned | Built | Why |
| --- | --- | --- |
| `tsc -b` with project references | Per-workspace `tsc --noEmit` | Bun and Vite consume source directly; composite builds added friction for no benefit |
| `publish` on the event bus | Stateless `publishDeviceEvent` function | Publishing needs no state; repository signature unchanged |
| Controlled form inputs | Uncontrolled inputs with `FormData` | Fewer re-renders and less state; validation happens once, on submit |
| Seed script with migrations | Seed script through the repository | Avoided duplicating the two-table insert logic |
| In-process event bus with `NOTIFY` as a later option | `LISTEN`/`NOTIFY` from the start | Confirmed `Bun.sql` supports both, including transactional `notify()` |

## Likely questions

| Question | Answer outline |
| --- | --- |
| How does the frontend know about changes made elsewhere? | `NOTIFY` in the write transaction, one `LISTEN` per process, SSE to the browser, events applied to the Query cache, refetch on every (re)connect |
| What if an event is missed? | Listener reconnects trigger `resync`; browser reconnects trigger a full refetch; a 60-second stale time is the last safety net |
| Why not WebSockets? | Traffic is one-way; SSE is plain HTTP, reconnects itself, and needs no protocol upgrade through the load balancer |
| Why not an ORM? | Explicit SQL is easy to reason about and explain; the cost is mapping and a small migration runner |
| How would you add a new device type? | Enum value and subtype table in a migration; schemas in `@iota/shared`; actions in `ACTIONS_BY_TYPE`, which the compiler then forces into the handler map; a branch in the repository; fields in `DeviceFields` |
| How do you stop the UI and API disagreeing on validation? | They run the same Zod schemas; the database constraints mirror them and tests check the boundaries |
| Why are there two update paths? | Settings versus commands; see PATCH versus actions |
| What happens under concurrent updates? | Row lock in the repository; newer-wins in the cache; last write wins for settings, which is acceptable for this domain |
| How would it scale? | See scalability below |
| How is it secured? | It is not yet; see authentication below. Current safeguards: parameterised SQL, strict schemas, no error detail leakage |
| What would you do with more time? | Deployment artefacts, auth, end-to-end tests, observability, audit log with replay |

## Further development

### Scalability

- The API is stateless apart from open SSE connections, so it scales
  horizontally on ECS. `LISTEN`/`NOTIFY` already fans events out across
  tasks. Scale on CPU and on concurrent connections per task.
- Each task holds its request pool plus one `LISTEN` connection. With
  many tasks, total connections become the constraint; size pools
  deliberately, and consider RDS Proxy for request traffic. The `LISTEN`
  connection must bypass any transaction-mode pooler, because `LISTEN`
  needs a session that persists.
- Every event currently goes to every client. With multiple homes, events
  should be filtered per subscriber in the bus, or published to
  per-home channels, so clients only receive their own devices.
- `NOTIFY` suits modest event rates. For high-frequency device telemetry,
  move events to a dedicated broker (SNS with SQS, or Redis streams) and
  telemetry into a time-series store, keeping Postgres for device
  configuration.
- Add pagination (cursor-based on room and name, matching the current
  sort) and indexes on `devices (room, name)` and `devices (type)` once
  lists grow.
- Read replicas for list-heavy traffic, accepting slight staleness on
  lists; the event stream would still come from the primary.
- Serve the frontend from S3 and CloudFront rather than the API, so
  static traffic stops consuming API capacity; the API would then need
  CORS or a CloudFront path behaviour routing `/api` to the ALB.

### Authentication and authorisation

- Authenticate with an OIDC provider; Cognito on AWS, or GOV.UK One Login
  for a public sector service. The API validates tokens and establishes
  a session.
- Use an `HttpOnly`, `Secure`, `SameSite=Lax` session cookie rather than
  bearer tokens, because `EventSource` cannot set an `Authorization`
  header. The same cookie then covers both requests and the event stream.
- Model `users`, `homes` and `home_members (home_id, user_id, role)`, and
  add `home_id` to `devices`. Roles such as owner, member and guest
  decide who can register, configure, act or delete.
- Enforce scoping in the repository by requiring a home id on every
  query, so no route can forget it. Postgres row-level security with a
  session variable is a stronger second layer.
- Filter SSE events by the subscriber's homes, so a client never receives
  another household's devices.
- Record the acting user on each action in an audit table, which also
  supports event replay.
- Protect state-changing requests against CSRF; `SameSite` cookies plus a
  check on the `Origin` header cover this for a same-origin app.
- Devices themselves would authenticate separately, with per-device
  credentials or mutual TLS over MQTT.

### End-to-end testing

- Playwright against the full stack started from Compose, with the API
  and the built frontend served together as in production.
- Seed known data before each test through the repository or a
  test-only reset step, keeping tests independent.
- Cover the main journeys: register a device with valid and invalid
  input, change settings, perform an action from both the list and the
  detail page, delete, and the not-found routes.
- Test live updates with two browser contexts: act in one and assert the
  other updates without reloading. Test reconnection by restarting the
  API and asserting the status indicator and a refetch.
- Add accessibility checks with `@axe-core/playwright` on each page.
- Run in CI with Postgres as a service container, keeping traces and
  screenshots as artefacts on failure.
- Component tests for form behaviour and the cache logic, such as the
  newer-wins rule, would sit below these and run faster.

### Monitoring

- Structured JSON logs with a request id on every line, sent to
  CloudWatch Logs; log actions with device id and, once auth exists, the
  acting user.
- Metrics per route: request rate, latency percentiles and error rate by
  status code. Application metrics: open SSE connections, events
  published and delivered, `LISTEN` reconnects and resyncs, and database
  pool usage.
- Tracing with OpenTelemetry through Hono middleware, exported to AWS
  X-Ray, so a slow request can be followed into its SQL.
- Alarms on 5xx rate, ALB target health, ECS task restarts, RDS CPU,
  storage and connection count, and a sustained rise in resyncs, which
  would indicate an unstable listening connection.
- Separate liveness from readiness. `/api/health` checks the database;
  a liveness check should not, so a database outage does not make ECS
  replace every task at once.
- Frontend error reporting, for example Sentry, including failed event
  parsing and API errors.

### Other improvements

- Optimistic updates for actions, rolling back on error, so buttons feel
  instant on slow connections.
- A `device_events` audit table, enabling `Last-Event-ID` replay instead
  of a full refetch on reconnect, and a device history view.
- Rooms as their own entity, with renaming and ordering.
- Device online and offline status, and real device integration through
  an MQTT ingestion service.
- An OpenAPI document generated from the Zod schemas, for clients other
  than the web app.
- A notice on the settings form when the device changes mid-edit,
  instead of resetting the form.
