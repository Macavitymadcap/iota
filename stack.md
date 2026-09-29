# iota: infrastructure and frontend libraries

Brief explanations of every AWS service in the proposed deployment and of
the three libraries the frontend uses to talk to the API. The deployment
is proposed rather than built; the frontend libraries are in the code.

## Deployment overview

| Service | Role in iota |
| --- | --- |
| VPC, subnets and security groups | Private network that isolates the database and application |
| VPC endpoints | Private routes from the VPC to AWS services, instead of a NAT gateway |
| Application Load Balancer | Public HTTPS entry point; routes traffic to healthy tasks |
| AWS Certificate Manager | Issues and renews the TLS certificate for the load balancer |
| ECS on Fargate | Runs the iota container without managing servers |
| ECR | Private registry for the container images |
| RDS for PostgreSQL | Managed Postgres database |
| Secrets Manager | Stores and rotates the database credentials |
| CloudWatch Logs | Collects the container's standard output |
| IAM | Roles and permissions for tasks and the pipeline |
| GitHub Actions with OIDC | Builds and deploys without stored AWS keys |
| S3 | Holds the Terraform state |

A request flows from the browser to the load balancer over HTTPS, then to
one of the ECS tasks in a private subnet, which queries RDS in another
private subnet. The browser never reaches anything but the load balancer.

## AWS services

### VPC, subnets and security groups

A Virtual Private Cloud is an isolated network within AWS. The proposal
spans two availability zones (separate data centres in one region), so
losing one zone leaves the service running in the other.

Each zone has a public subnet, which can be reached from the internet,
and private subnets, which cannot. Only the load balancer sits in public
subnets; the ECS tasks and the database sit in private ones.

Security groups are stateful firewalls attached to resources. The chain
is: the load balancer accepts HTTPS from anywhere, the tasks accept
traffic only from the load balancer's security group, and the database
accepts Postgres connections only from the tasks' security group.

### VPC endpoints

Tasks in private subnets have no route to the internet, but they still
need to pull images from ECR, read secrets and send logs. VPC endpoints
provide private connections to those AWS services from inside the VPC.

The proposal needs interface endpoints for ECR (both its API and Docker
registry endpoints), Secrets Manager and CloudWatch Logs, plus a gateway
endpoint for S3, because ECR stores image layers in S3.

The alternative is a NAT gateway, which gives private subnets outbound
internet access. It is simpler to reason about but has an hourly charge
per zone plus data processing charges, and iota never needs to reach the
wider internet.

### Application Load Balancer

The ALB is the only public component. It terminates HTTPS, forwards
requests to the ECS tasks registered in its target group, and checks each
task's health by calling `/api/health`; unhealthy tasks stop receiving
traffic.

Two details matter for iota. The ALB closes connections that are idle
for longer than its idle timeout (60 seconds by default), so the API's
SSE stream sends a heartbeat every 20 seconds. And because the ALB keeps
long-lived connections open, it suits server-sent events, which is why
the proposal uses it with Fargate rather than App Runner, whose request
timeout would repeatedly cut the stream.

### AWS Certificate Manager

ACM issues the TLS certificate the ALB presents to browsers, validates
domain ownership through DNS, and renews the certificate automatically.
It needs a domain name; if the domain is in Route 53, Terraform can
create the validation records too.

### ECS on Fargate

Elastic Container Service runs containers. Fargate is its serverless mode:
AWS provides the compute for each task, so there are no EC2 instances to
patch or scale.

| Term | Meaning in iota |
| --- | --- |
| Cluster | A logical grouping for iota's services and tasks |
| Task definition | The container specification: image, CPU and memory, environment variables, secrets, log settings and IAM roles |
| Task | One running copy of the task definition |
| Service | Keeps the desired number of tasks running, registers them with the ALB, and manages deployments |

A deployment registers a new task definition revision pointing at the new
image, and the service replaces old tasks with new ones. The deployment
circuit breaker watches the new tasks; if they keep failing health checks,
it rolls back to the previous revision automatically.

The same image also runs the database migration, as a one-off task with a
different command, before the service is updated.

When ECS stops a task it sends `SIGTERM`, waits (30 seconds by default),
then sends `SIGKILL`. The API uses that window to close its SSE streams,
finish in-flight requests and close its database pool.

### ECR

Elastic Container Registry is a private Docker image registry. The
pipeline pushes each image tagged with its commit SHA, so every
deployment points at an exact, traceable build. A lifecycle policy keeps
the last ten images and deletes older ones, which caps storage cost while
keeping recent versions available for rollback.

### RDS for PostgreSQL

Relational Database Service runs Postgres with AWS handling provisioning,
patching, backups and point-in-time recovery. The proposal uses Postgres
17 on a `db.t4g.micro` instance, which is ample for iota and can be
resized later, placed in the private subnets.

Everything iota relies on works on RDS, including `LISTEN`/`NOTIFY`. Each
API task holds one extra connection for `LISTEN`, which connection limits
must allow for.

With `manage_master_user_password` enabled, RDS generates the database
password and stores it in Secrets Manager itself, so the password never
appears in Terraform code or state.

### Secrets Manager

Secrets Manager stores sensitive values and can rotate them. The
RDS-managed secret holds the database username and password as JSON keys.

The ECS task definition references the secret's keys, and ECS injects
them into the container as `PGUSER` and `PGPASSWORD` when a task starts.
Together with `PGHOST`, those are read directly by `Bun.sql`, which is why
the API accepts discrete `PG*` variables as well as a `DATABASE_URL`.

### CloudWatch Logs

With the `awslogs` log driver, everything the container writes to
standard output and standard error goes to a CloudWatch log group, with
one stream per task. That includes the API's startup and shutdown
messages and any unexpected errors it logs. Log groups have a retention
period so old logs expire.

### IAM

Identity and Access Management controls who can do what. Four roles are
involved:

| Role | Used by | Allows |
| --- | --- | --- |
| Task execution role | ECS itself, while starting a task | Pulling the image from ECR, reading the database secret, writing to CloudWatch Logs |
| Task role | The running application | Nothing at present; iota calls no AWS APIs |
| Deploy role | GitHub Actions | Pushing to ECR, running the migration task, updating the service |
| Terraform role | Whoever applies infrastructure | Managing the resources above |

The execution role and task role are separate so the application's
permissions can stay minimal even though ECS needs broader ones to start
it.

### GitHub Actions with OIDC

GitHub Actions runs the pipeline: typecheck, lint and test on every push,
then build, migrate and deploy on merge to `main`.

Instead of storing long-lived AWS access keys as GitHub secrets, the
pipeline uses OpenID Connect. Terraform registers GitHub as an identity
provider in the AWS account. During a workflow run, GitHub issues a
short-lived signed token describing the repository and branch; AWS checks
it against the deploy role's trust policy (for example, "only the `main`
branch of this repository") and returns temporary credentials that expire
when the job ends. There are no keys to leak or rotate.

### S3 for Terraform state

Terraform records what it has created in a state file. Storing it in an
S3 bucket, with versioning and encryption, lets anyone with access apply
changes and keeps history. The S3 backend's native lock file (Terraform
1.10 and later) stops two people applying at once, which previously
needed a separate DynamoDB table.

### Optional: Route 53

Route 53 is AWS's DNS service. If iota had a domain, an alias record
would point it at the ALB, and ACM would validate the certificate through
records in the same hosted zone.

## Frontend libraries

The three libraries have separate jobs. `hc` makes typed HTTP requests,
TanStack Query caches the results and keeps them fresh, and TanStack
Router decides what to render for each URL and starts loading its data.

### Hono's `hc` client

`hc` is Hono's RPC client. It builds requests from the server's route
definitions, so the frontend gets typed paths, parameters, request
bodies and responses without generated code or hand-written types.

The API exports the type of its app:

```ts
export type AppType = ReturnType<typeof createApp>;
```

The frontend creates a client from that type alone:

```ts
import type { AppType } from "@iota/api";
import { hc } from "hono/client";

export const api = hc<AppType>(window.location.origin).api;
```

Calls then mirror the route structure, and TypeScript checks them against
the server's validators:

```ts
api.devices[":id"].actions[":action"].$post({ param: { id, action: "turn-on" } });
```

Sending a body the server's Zod schema would reject, or an action name
that does not exist, is a compile error. Because the import is
`import type`, it is erased at build time; only the types cross the
boundary, never server code.

`hc` behaves like `fetch`: it returns the response and does not throw on
error statuses. iota's `unwrap` helper checks `res.ok`, turns problem
details into a typed `ApiError`, and otherwise returns the typed body.

### TanStack Query

TanStack Query manages server state: data that lives on the server and is
shown by the client. It caches responses under query keys, shares one
request between every component that asks for the same data, and decides
when cached data is stale and needs refetching.

A query is described once, as query options:

```ts
export const deviceQuery = (id: string) =>
  queryOptions({
    queryKey: ["devices", "detail", id],
    queryFn: () => unwrap(api.devices[":id"].$get({ param: { id } })),
  });
```

Components read it with `useSuspenseQuery(deviceQuery(id))`, which
returns the data directly because the route loader has already fetched
it. The same options are reused for loading, reading and cache updates,
so keys cannot drift.

Keys are hierarchical, so related entries can be targeted together:
invalidating `["devices", "list"]` refreshes every filtered list at once.

Writes are mutations (`useMutation`). Because the API returns the updated
device from every write, iota's mutations put it straight into the detail
cache entry with `setQueryData` and invalidate the lists, instead of
refetching everything.

The same cache functions handle server-sent events. When an event
arrives, the device is written into the cache exactly as a mutation
response would be, so every component showing that device re-renders.
The cache is the only client-side copy of device state.

`staleTime` controls how long data counts as fresh. iota uses 60 seconds
as a safety net; the event stream is what normally keeps the cache
current.

### TanStack Router

TanStack Router maps URLs to components with full type safety: route
paths, path parameters and search parameters are all typed, and linking
to a route with the wrong parameters is a compile error.

iota defines three routes in code: the device list, the registration
form and the device detail page. Each route can have:

- A loader, which runs before the route renders. iota's loaders call
  `queryClient.ensureQueryData`, which returns cached data if it is fresh
  and fetches it otherwise, so the page renders with its data ready.
- Search parameter validation. The list's type filter is validated with
  a Zod schema, so `?type=camera` becomes a typed value and an invalid
  value falls back to showing everything. Keeping the filter in the URL
  means it survives a refresh and can be shared.
- Not-found and error components. The detail loader turns a 404 or 400
  from the API into the route's not-found page.

The router receives the `QueryClient` through its context, which is how
loaders reach the cache. With `defaultPreload: "intent"`, hovering over a
link starts that route's loader, so data is often ready before the click.
Setting `defaultPreloadStaleTime` to 0 means the router always asks Query
and never keeps its own cache, so there is one cache and one definition
of freshness.

Pages use `getRouteApi("/devices/$id")` to read their typed parameters
without importing the route object, which avoids a circular import
between pages and the router file.

### How they work together

Opening a device's detail page runs through all three:

1. TanStack Router matches `/devices/$id` and runs the route's loader.
2. The loader calls `ensureQueryData(deviceQuery(id))`. If TanStack
   Query has fresh data for that key, it returns immediately; otherwise
   it calls the query function.
3. The query function calls `hc`, which sends a typed request to
   `/api/devices/:id`, and `unwrap` returns the typed device or throws.
4. The router renders the page, which reads the same cache entry with
   `useSuspenseQuery`.
5. When the user performs an action, a mutation calls `hc`, writes the
   returned device into the cache, and the page re-renders. The event
   stream delivers the same change to every other open window.
