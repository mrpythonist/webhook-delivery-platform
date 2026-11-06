# Webhook Delivery Platform

Reliable webhook delivery with automatic retries, per-endpoint retry policy,
HMAC-signed payloads, and a dashboard that shows every attempt.

## What problem it solves

When your app needs to notify other systems about events (a payment
succeeded, a subscription was created), it usually POSTs a JSON payload to a
URL the customer registered. That POST can fail: the customer server is down,
slow, or returns a 500. If you fire and forget, the customer never learns
about the event. If you retry by hand, you need to track what was sent,
what failed, and how many times you already tried.

This project is a small, self-contained version of what Stripe Webhooks does:
register endpoints, publish events, and let the platform deliver each event
reliably, retrying with exponential backoff until it succeeds or the retry
budget runs out, while recording every attempt so you can see exactly what
happened.

## Why it exists

It is a learning project and a portfolio piece. It shows the moving parts of
an event-driven delivery system in one readable codebase: an API that fans
events out to subscribers, a queue that holds deliveries, a worker that
performs them, signed payloads a receiver can verify, and a dashboard that
makes the whole flow visible. It is not a hosted service and it is not
production-hardened. See [Limitations](#limitations).

## Key features

- **Endpoint registration.** Register webhook URLs with event-type
  subscriptions and a signing secret. An empty subscription list means all
  event types.
- **Event fan-out.** Publishing one event creates one delivery per active
  subscribed endpoint and enqueues each delivery on BullMQ.
- **Automatic retries with per-endpoint policy.** Each endpoint sets its own
  `maxAttempts` (default 5) and `backoffBaseMs` (default 1000). Retries use
  exponential backoff: base, 2x base, 4x base, and so on. The policy is
  captured at enqueue time.
- **Full delivery log.** Every attempt records the HTTP status code, the
  response body (truncated to 4 KB), the error, the duration, and the
  signature that was sent.
- **Delivery lifecycle.** Deliveries move through `queued`, `delivering`,
  `delivered`, and `failed`, with attempt counts and last status codes.
  Deactivating an endpoint fails its pending deliveries fast, with no
  further attempts.
- **HMAC-signed payloads.** Every attempt sends a Stripe-style HMAC-SHA256
  signature (`X-Webhook-Signature`) plus a stable delivery id
  (`X-Webhook-Delivery-Id`) so receivers can verify authenticity and
  deduplicate retries. A `verify()` helper is included.
- **Dashboard.** Delivery stats, endpoint management, a send-test-event
  form, and per-delivery detail pages with the payload, the signature
  headers, and the attempt timeline. The dashboard refreshes every 5
  seconds.
- **Demo receiver.** A stand-in customer service with ok, slow, flaky, and
  dead endpoints, so you can watch retries recover and watch them exhaust.
- **Seed script.** Registers the demo endpoints and fires four realistic
  sample events.

## Screenshots

There is no headless browser on the machine used to prepare these docs, so
there are no GUI screenshots. What exists instead are genuine terminal
captures from a real run on 2026-11-06, kept in `docs/screenshots/`:

- `api-build.txt` - `npm run build` for the API (`tsc`, exit code 0).
- `prisma-validate.txt` - `npx prisma validate`: the schema is valid.
- `api-health.txt` - the API started from a local build and
  `GET /api/health` returning `{"ok":true,"service":"webhook-platform-api",...}`.
- `demo-receiver.txt` - the demo receiver build, `GET /health`, and
  `POST /ok` returning `{"received":true}`.
- `web-build.txt` - the dashboard `npm run build` passing. This file also
  records that `npm run lint` does not work yet: there is no ESLint config,
  so it stops and asks how to configure ESLint (exit code 1). The build
  itself runs its own linting and type checking step and passes.

The full stack (PostgreSQL and Redis running, events flowing, retries
visible in the dashboard) has not been run in this environment, because
there is no Docker here and no Postgres or Redis. See
[Limitations](#limitations).

## Architecture

```mermaid
flowchart LR
    Producer["Producer<br/>API client, dashboard form,<br/>or seed script"] -->|POST /api/events| API["Express API :3001"]
    API -->|persist event + deliveries| PG[("PostgreSQL<br/>Prisma")]
    API -->|enqueue one job per delivery| Redis[("Redis<br/>BullMQ queue<br/>webhook-deliveries")]
    Redis -->|consume, concurrency 10| Worker["BullMQ worker"]
    Worker -->|POST signed JSON<br/>10s timeout| Customer["Customer endpoint"]
    Worker -->|record attempt + update status| PG
    Dashboard["Next.js dashboard :3000"] -->|GET /api/stats, /api/endpoints,<br/>/api/deliveries (from browser)| API
```

The API is the producer: it persists the event and one `Delivery` row per
subscribed endpoint, then enqueues a BullMQ job. The worker is the consumer:
it signs the payload, POSTs it with a 10 second timeout, records a
`DeliveryAttempt`, and updates the `Delivery`. The dashboard only reads
through the API; it never touches Redis.

For the full design, data model, retry semantics, and trade-offs, see
[docs/architecture.md](docs/architecture.md).

## Tech stack

- Node.js 20 or later, TypeScript 5 (strict mode)
- Express 4 for the API and the demo receiver
- BullMQ 5 on Redis 7 for the delivery queue
- PostgreSQL 17 through Prisma 5
- Next.js 14 with React 18 and Tailwind CSS for the dashboard
- Docker Compose for the full stack

## Prerequisites

- Node.js 20 or later and npm.
- Docker and Docker Compose for the full stack, or PostgreSQL 17 and Redis 7
  running locally if you prefer to run services without Docker.

## Installation

```bash
git clone https://github.com/mrpythonist/webhook-delivery-platform.git
cd webhook-delivery-platform
cp .env.example .env
```

Each app under `apps/` is a separate npm package. Install dependencies per
app when running locally:

```bash
cd apps/api && npm install
cd ../web && npm install
cd ../demo-receiver && npm install
```

## Configuration

Copy `.env.example` to `.env` for local runs. Inside Docker Compose,
`DATABASE_URL` and `REDIS_URL` are overridden by the service environment in
`docker-compose.yml`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://webhooks:webhooks@localhost:5432/webhooks` | PostgreSQL connection string for the API and worker |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string for the API and worker |
| `PORT` | `3001` (API), `3002` (demo receiver) | HTTP port |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` | API base URL for the dashboard. It is fetched from the browser, so it must be browser-reachable. It is baked in at build time for the Docker image. |
| `API_URL` | `http://localhost:3001` | API base URL for the seed script |
| `DEMO_RECEIVER_URL` | `http://localhost:3002` | Demo receiver base URL for the seed script |

The `webhooks`/`webhooks` credentials in `.env.example` and
`docker-compose.yml` are local development placeholders only. Change them
before any shared or internet-facing use.

## Quick start

### With Docker Compose

```bash
docker compose up --build
```

This starts PostgreSQL, Redis, the API on :3001, the worker, the demo
receiver on :3002, and the dashboard on :3000. Then seed demo data:

```bash
cd apps/api
npm install
API_URL=http://localhost:3001 DEMO_RECEIVER_URL=http://localhost:3002 npm run seed
```

Then open the dashboard at http://localhost:3000:

- Send a test event from the dashboard form and watch deliveries appear.
- Watch the `demo-receiver/flaky` endpoint: it 500s the first two attempts
  of each delivery, then succeeds, so the attempt timeline shows the
  recovery.
- Watch `demo-receiver/dead`: it always 500s, so deliveries exhaust all 5
  attempts with exponential backoff and end up `failed`.
- Open any delivery for its full payload, the signature headers sent, and
  the per-attempt timeline (status code, duration, response excerpt, error).

Note: Docker Compose has not been run against live services in the
environment where these docs were written (no Docker available). The compose
file is present and reviewed, but not executed. If you run it and find a
problem, please open an issue.

### Locally (without Docker)

You need PostgreSQL 17 and Redis 7 running locally first.

```bash
# API + worker
cd apps/api
npm install
cp ../../.env.example .env   # then edit DATABASE_URL / REDIS_URL
npx prisma migrate deploy
npm run dev                  # API on :3001 (new terminal: npm run worker)

# Demo receiver
cd ../demo-receiver
npm install
npm run dev                  # :3002

# Dashboard
cd ../web
npm install
npm run dev                  # :3000 (uses NEXT_PUBLIC_API_URL, default http://localhost:3001)

# Seed
cd ../api
npm run seed
```

Useful checks once the stack is up:

```bash
curl localhost:3001/api/health
curl localhost:3001/api/stats
docker compose logs -f worker        # retry activity
docker compose logs -f demo-receiver # incoming webhook hits
```

## Usage and API reference

Base URL: `http://localhost:3001` by default. All responses are JSON.
Request bodies are limited to 1 MB. There is no authentication on any route.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | Liveness check. Works without a database. |
| POST | `/api/endpoints` | Register endpoint. Body: `{ url, events?, secret?, maxAttempts?, backoffBaseMs? }`. `events: []` (default) means all event types. A 32-byte hex secret is generated if omitted. URL must be http(s). |
| GET | `/api/endpoints` | List endpoints, newest first. |
| PATCH | `/api/endpoints/:id` | Update `url`, `events`, `secret`, `maxAttempts`, `backoffBaseMs`, `active`. |
| DELETE | `/api/endpoints/:id` | Delete endpoint (cascades to its deliveries). Returns 204. |
| POST | `/api/events` | Publish event. Body: `{ type, payload }`. Creates the event, one delivery per active subscribed endpoint, and enqueues each delivery. |
| POST | `/api/events/seed` | Publish sample events (`payment.succeeded`, `payment.failed`, `subscription.created`, `invoice.paid`) with realistic payloads. |
| GET | `/api/deliveries?status=&endpointId=&take=` | List deliveries, newest first (default 50, max 200). Includes endpoint URL and event type. |
| GET | `/api/deliveries/:id` | Full delivery: endpoint, event payload, attempts ordered by attempt number. |
| GET | `/api/stats` | Aggregate counts, average attempts, delivered percentage (powers the dashboard). |

### Example

```bash
# Register an endpoint
curl -X POST http://localhost:3001/api/endpoints \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://example.com/webhooks", "events": ["payment.succeeded"]}'

# Publish an event
curl -X POST http://localhost:3001/api/events \
  -H 'Content-Type: application/json' \
  -d '{"type": "payment.succeeded", "payload": {"id": "evt_1", "amount": 4999, "currency": "usd"}}'

# Check deliveries
curl http://localhost:3001/api/deliveries
```

### Signature verification

Every delivery attempt sends these headers:

| Header | Value |
| --- | --- |
| `Content-Type` | `application/json` |
| `X-Webhook-Event-Type` | For example `payment.succeeded` |
| `X-Webhook-Delivery-Id` | Delivery id, stable across retries, so receivers can dedupe |
| `X-Webhook-Timestamp` | Unix timestamp of the attempt |
| `X-Webhook-Signature` | `t=<ts>,v1=<hex>` |

The signature is `HMAC-SHA256(endpoint_secret, "<ts>.<raw_json_body>")`,
hex-encoded. Receivers recompute the HMAC over the timestamp and the exact
raw body and compare in constant time, rejecting timestamps older than 5
minutes (replay protection). A `verify()` helper lives in
`apps/api/src/lib/sign.ts`.

Full API details, including request fields, error responses, and the stats
shape, are in [docs/api.md](docs/api.md).

## Project structure

```text
.
├── apps/
│   ├── api/            # Express API + BullMQ worker (TypeScript)
│   │   ├── prisma/     # Prisma schema and the initial migration
│   │   └── src/
│   │       ├── index.ts    # HTTP API: endpoints, events, deliveries, stats
│   │       ├── worker.ts   # BullMQ worker: one run is one delivery attempt
│   │       ├── seed.ts     # Register demo endpoints, fire sample events
│   │       ├── db.ts       # Prisma client singleton
│   │       ├── queue.ts    # BullMQ queue and Redis connection
│   │       └── lib/
│   │           ├── deliver.ts  # POST with 10s timeout, 4 KB body cap
│   │           ├── publish.ts  # Fan-out: event to deliveries to queue
│   │           └── sign.ts     # HMAC sign and verify
│   ├── web/            # Next.js 14 dashboard (TypeScript, Tailwind)
│   │   ├── app/        # Dashboard, endpoints page, delivery detail page
│   │   └── lib/api.ts  # Typed API client used by the dashboard
│   └── demo-receiver/  # Demo customer endpoints: ok, slow, flaky, dead
├── .env.example
├── docker-compose.yml
└── docs/
    ├── architecture.md
    ├── development.md
    ├── api.md
    └── screenshots/    # Genuine terminal captures from a real run
```

## Testing

There is no automated test suite yet. That is a known gap, and adding one
is on the roadmap.

Until then, the verification gate is the build and the schema check, run
per app:

```bash
cd apps/api && npm install && npm run build
cd ../demo-receiver && npm install && npm run build
cd ../web && npm install && npm run build
cd ../api && DATABASE_URL=postgres://webhooks:webhooks@localhost:5432/webhooks npx prisma validate
```

These were run on 2026-11-06 on Node v24.22.1 and all passed; the output is
kept in `docs/screenshots/`. See [docs/development.md](docs/development.md)
for what runs without PostgreSQL and Redis and what does not.

## Deployment

The simplest deployment is Docker Compose: one command starts Postgres,
Redis, the API, the worker, the demo receiver, and the dashboard. That path
has not been run live yet (see [Limitations](#limitations)).

For a plain Node deployment, build each app (`npm run build` in
`apps/api`, `apps/web`, and `apps/demo-receiver`), set `DATABASE_URL`,
`REDIS_URL`, and `NEXT_PUBLIC_API_URL`, run the Prisma migration
(`npx prisma migrate deploy`), then run the API (`npm start` in `apps/api`),
the worker (`npm run worker` in `apps/api`, or `node dist/worker.js`),
the dashboard (`npm start` in `apps/web`), and the demo receiver only if
you want the demo endpoints.

There is no hosted demo, no TLS termination, and no process manager config
in this repository. Run the services under a process manager such as systemd
or PM2, and put a reverse proxy with TLS in front of the API if it is
reachable beyond localhost.

## Security

- There is **no authentication or authorization** on the API. Do not expose
  it to the public internet without adding auth in front of it.
- Endpoint signing secrets are stored as **plaintext** in PostgreSQL. A
  production system should encrypt them at rest.
- There is **no rate limiting** on event publishing and **no TLS
  termination** in the project itself.
- Delivery payloads are capped at 1 MB. Stored response bodies are truncated
  to 4 KB per attempt.
- To report a security issue, see [SECURITY.md](SECURITY.md).

## Limitations

Honest limits of this version. These are deliberate omissions or known gaps,
not oversights to hide.

- **Docker Compose and the Prisma migration have not been run against a live
  database.** The migration in `apps/api/prisma/migrations/0001_init/` was
  hand-authored. Run `prisma migrate dev` against a real database and review
  the diff before treating it as canonical.
- **The end-to-end retry flow has not been observed here.** Watching a flaky
  endpoint recover needs PostgreSQL and Redis running, which were not
  available in the environment where these docs were written. The code path
  is reviewed; the build, schema, health endpoint, and demo receiver were
  run and are captured in `docs/screenshots/`.
- **Single worker process (concurrency 10).** No horizontal worker scaling,
  leader election, or dead-letter queue beyond the `failed` status. If
  Redis is lost, queued jobs are lost; the delivery rows in PostgreSQL still
  show what was pending, but nothing re-queues them automatically.
- **No test suite.** See [Testing](#testing).
- **`npm run lint` in `apps/web` does not work yet.** There is no ESLint
  configuration, so it stops and asks how to configure ESLint. The dashboard
  build runs its own linting and type checking step and passes.
- **The demo receiver's flaky hit counter is in-memory.** It resets on
  restart and does not work across replicas.
- **No TLS termination, no authentication, no rate limiting.** See
  [Security](#security).
- **Dashboard fetches the API from the browser**, so
  `NEXT_PUBLIC_API_URL` must be browser-reachable.

## Roadmap

Ideas under consideration, in no promised order. Nothing here is a
commitment.

- Automated tests for the sign/verify helpers, the delivery logic, and the
  API routes.
- ESLint configuration so `npm run lint` works in `apps/web`, and lint
  configs for the API and demo receiver.
- A manual redelivery endpoint (`POST /api/deliveries/:id/redeliver`) for
  failed deliveries.
- A reconciliation job that re-queues deliveries stuck in `queued` after a
  Redis loss.
- A dead-letter view in the dashboard for failed deliveries.
- Authentication for the API and rate limiting on event publishing.
- Encryption of endpoint secrets at rest.
- A verified Docker Compose run and a CI job that runs the stack.
- Retention policy and cleanup for old deliveries and attempts.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup,
branch and commit conventions, verification steps, and the pull request
process. By participating you agree to the
[Code of Conduct](CODE_OF_CONDUCT.md).

## License

MIT. See [LICENSE](LICENSE).
