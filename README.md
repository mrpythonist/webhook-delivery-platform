# Webhook Delivery & Reliability Platform

A simplified Stripe Webhooks clone: register webhook endpoints, publish events,
and get reliable delivery with automatic retries, per-endpoint retry policy,
HMAC-signed payloads, and a dashboard for delivery logs, payloads, and attempt
timelines.

**Stack:** Node.js 20 + TypeScript, Express, BullMQ (Redis), PostgreSQL
(Prisma), Next.js 14 + Tailwind dashboard, Docker Compose.

## Features

- Register webhook endpoints with URL, event-type subscriptions, and signing secret
- Publish events (`POST /api/events`) and fan them out to subscribed endpoints
- Queue deliveries on Redis via BullMQ; a dedicated worker pool (concurrency 10) performs deliveries
- Automatic retries with per-endpoint max attempts and exponential backoff
- Delivery tracking: status (`queued` / `delivering` / `delivered` / `failed`), attempt count, last response code
- Full delivery log: every attempt records status code, response body (truncated to 4KB), error, and duration
- Stripe-style HMAC-SHA256 signatures (`X-Webhook-Signature`) so receivers can verify authenticity
- Dashboard: delivery stats, endpoint management, send-test-event form, delivery detail with payload + attempt timeline
- Demo receiver service with ok / slow / flaky / dead endpoints to watch retries succeed and fail
- Seed script that registers the demo endpoints and fires realistic sample events

## Architecture

```
                          ┌─────────────┐
                          │   Producer  │  (you, via API / dashboard / seed)
                          └──────┬──────┘
                                 │ POST /api/events
                                 ▼
                          ┌─────────────┐      stores      ┌──────────────┐
                          │  Express    ├─────────────────►│  PostgreSQL  │
                          │  API        │  endpoints,      │  (Prisma)    │
                          │  :3001      │  events,         └──────────────┘
                          └──────┬──────┘  deliveries,
                                 │         attempts
                                 │ enqueue {deliveryId}
                                 ▼
                          ┌─────────────┐
                          │    Redis    │◄── BullMQ "webhook-deliveries"
                          │    :6379    │    attempts = maxAttempts,
                          └──────┬──────┘    backoff = exponential(baseMs)
                                 │ consume (concurrency 10)
                                 ▼
                          ┌─────────────┐      POST JSON       ┌──────────────┐
                          │   BullMQ    ├─────────────────────►│  Customer    │
                          │   Worker    │  signed, 10s timeout │  endpoints   │
                          └──────┬──────┘                      └──────────────┘
                                 │ write result
                                 ▼
                          ┌──────────────┐      reads       ┌──────────────┐
                          │  PostgreSQL  │◄─────────────────│  Next.js     │
                          └──────────────┘                  │  dashboard   │
                                                            │  :3000       │
                                                            └──────────────┘
```

The API is the producer: it persists the event and one `Delivery` row per
subscribed endpoint, then enqueues a BullMQ job. The worker is the consumer:
it signs the payload, POSTs it, records a `DeliveryAttempt`, and updates the
`Delivery`. The dashboard only reads PostgreSQL — it never touches Redis.

## Retry semantics

- Each delivery is enqueued as one BullMQ job with `attempts = endpoint.maxAttempts`
  and `backoff: { type: 'exponential', delay: endpoint.backoffBaseMs }`.
- One worker run = one delivery attempt. The worker:
  1. marks the delivery `delivering` and increments `attemptsMade`,
  2. POSTs the signed payload (10s timeout),
  3. inserts a `DeliveryAttempt` row (status code, truncated response body, error, duration),
  4. on 2xx → delivery is `delivered`;
  5. on failure with attempts remaining → delivery goes back to `queued` and the
     job throws so BullMQ retries it with exponential backoff
     (delays: base, 2×base, 4×base, …);
  6. on the final failed attempt → delivery is `failed` and the job completes
     (no infinite retry loop).
- Retry policy is captured **at enqueue time**: changing an endpoint's
  `maxAttempts` later does not affect already-queued deliveries.
- Deactivating an endpoint fail-fast marks its pending deliveries `failed`
  without further attempts.

## Signature verification

Every delivery attempt sends:

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `X-Webhook-Event-Type` | e.g. `payment.succeeded` |
| `X-Webhook-Delivery-Id` | delivery id (stable across retries — receivers can dedupe) |
| `X-Webhook-Timestamp` | unix timestamp of the attempt |
| `X-Webhook-Signature` | `t=<ts>,v1=<hex>` |

The signature is `HMAC-SHA256(endpoint_secret, "<ts>.<raw_json_body>")`,
hex-encoded. Receivers recompute the HMAC over the timestamp and the exact
raw body and compare in constant time, rejecting timestamps older than
5 minutes (replay protection). A `verify()` helper lives in
`apps/api/src/lib/sign.ts`.

## Quickstart

Requires Docker and Docker Compose.

```bash
# 1. Start everything (postgres, redis, api, worker, demo-receiver, dashboard)
cp .env.example .env   # required: compose reads env_file .env for api/worker
docker compose up --build

# 2. In another terminal, seed demo endpoints + sample events
cd apps/api
npm install
API_URL=http://localhost:3001 \
DEMO_RECEIVER_URL=http://localhost:3002 \
npm run seed
```

Then open the dashboard at **http://localhost:3000**:

- **Send a test event** from the dashboard form and watch deliveries appear.
- Watch the `demo-receiver/flaky` endpoint: it 500s the first two attempts of
  each delivery, then succeeds — the attempt timeline shows the recovery.
- Watch `demo-receiver/dead`: it always 500s, so deliveries exhaust all 5
  attempts with exponential backoff and end up `failed`.
- Open any delivery for its full payload, the signature headers sent, and the
  per-attempt timeline (status code, duration, response excerpt, error).

Useful checks:

```bash
curl localhost:3001/api/health
curl localhost:3001/api/stats
docker compose logs -f worker        # retry activity
docker compose logs -f demo-receiver # incoming webhook hits
```

## Local development (without Docker)

You need PostgreSQL 17 and Redis 7 running locally.

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

## API reference

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Liveness check |
| POST | `/api/endpoints` | Register endpoint. Body: `{ url, events?, secret?, maxAttempts?, backoffBaseMs? }`. `events: []` (default) = all event types. A 32-byte hex secret is generated if omitted. URL must be http(s). |
| GET | `/api/endpoints` | List endpoints (newest first) |
| PATCH | `/api/endpoints/:id` | Update `url`, `events`, `secret`, `maxAttempts`, `backoffBaseMs`, `active` |
| DELETE | `/api/endpoints/:id` | Delete endpoint (cascades to its deliveries) |
| POST | `/api/events` | Publish event. Body: `{ type, payload }`. Creates the event, one delivery per active subscribed endpoint, and enqueues each delivery. |
| POST | `/api/events/seed` | Publish sample events (`payment.succeeded`, `payment.failed`, `subscription.created`, `invoice.paid`) with realistic payloads |
| GET | `/api/deliveries?status=&endpointId=&take=` | List deliveries, newest first (default 50, max 200); includes endpoint URL and event type |
| GET | `/api/deliveries/:id` | Full delivery: endpoint, event payload, attempts ordered by attempt number |
| GET | `/api/stats` | Aggregate counts, average attempts, delivered percentage (powers the dashboard) |

## Resume bullets

**Webhook Delivery & Reliability Platform**

- Built an event-driven webhook delivery platform (Node.js/TypeScript, Express, BullMQ on Redis, PostgreSQL via Prisma) that fans published events out to subscribed endpoints with per-endpoint retry policy and exponential backoff.
- Implemented a BullMQ worker (concurrency 10) that signs each payload with Stripe-style HMAC-SHA256 signatures, delivers with a 10s timeout, and persists a full attempt log (status code, truncated response body, error, duration) for every try.
- Designed the retry lifecycle: deliveries transition queued → delivering → delivered/failed, with attempt counts and last status codes tracked per delivery and retry policy captured at enqueue time.
- Built a Next.js + Tailwind dashboard showing delivery stats, endpoint management, a send-test-event form, and per-delivery detail pages with payloads, signature headers, and attempt timelines.
- Created a demo receiver service (ok / slow / flaky / dead endpoints) plus a seed script to demonstrate retry recovery and exhausted-retry failure end to end; shipped the whole stack as a Docker Compose monorepo.

## Limitations (not production-hardened)

- Single worker process (concurrency 10); no horizontal worker scaling, leader election, or dead-letter queue beyond the `failed` status.
- The demo receiver's flaky hit counter is in-memory: it resets on restart and would not work across replicas.
- No TLS termination, no authentication/authorization on the API, no rate limiting on event publishing.
- Secrets are stored as plaintext in the database; a production system would encrypt them at rest.
- The initial Prisma migration was hand-authored; run `prisma migrate dev` against a real database and review the diff before treating it as canonical.
- Delivery payloads are capped at 1MB (`express.json` limit); response bodies are truncated to 4KB per attempt.
- Dashboard fetches the API from the browser, so `NEXT_PUBLIC_API_URL` must be browser-reachable.
