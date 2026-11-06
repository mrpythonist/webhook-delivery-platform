# API Reference

Base URL: `http://localhost:3001` by default (the `PORT` environment
variable). All responses are JSON. Request bodies are limited to 1 MB
(`express.json` limit).

There is no authentication on any route. Do not expose this API to the public
internet as-is.

## Health

### `GET /api/health`

Liveness check. Works without a database connection.

```bash
curl http://localhost:3001/api/health
```

Response:

```json
{"ok": true, "service": "webhook-platform-api", "time": "2026-11-06T05:07:16.431Z"}
```

## Endpoints

### `POST /api/endpoints`

Register a webhook endpoint.

```bash
curl -X POST http://localhost:3001/api/endpoints \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://example.com/webhooks", "events": ["payment.succeeded"], "maxAttempts": 5, "backoffBaseMs": 1000}'
```

Request body:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `url` | string | Yes | Must be a valid `http(s)` URL. |
| `events` | string[] | No | Event types to subscribe to. Empty array (the default) means all event types. Must be an array of strings. |
| `secret` | string | No | Signing secret. A 32-byte hex secret is generated if omitted. |
| `maxAttempts` | integer | No | Positive integer, default 5. |
| `backoffBaseMs` | integer | No | Non-negative integer in milliseconds, default 1000. |

Returns `201` with the created endpoint, including the generated `secret`
and the `id`. Validation failures return `400` with
`{"error": "..."}`.

### `GET /api/endpoints`

List endpoints, newest first. Returns a JSON array.

```bash
curl http://localhost:3001/api/endpoints
```

### `PATCH /api/endpoints/:id`

Update `url`, `events`, `secret`, `maxAttempts`, `backoffBaseMs`, or
`active`. Only the fields you send are changed. Returns the updated
endpoint, or `404` with `{"error": "endpoint not found"}`.

Note: changing `maxAttempts` or `backoffBaseMs` does not affect deliveries
that are already queued. The retry policy is captured on the BullMQ job at
enqueue time.

Deactivating an endpoint (`"active": false`) makes the worker fail its
pending deliveries fast, without further attempts.

### `DELETE /api/endpoints/:id`

Delete an endpoint. Its deliveries are deleted too (cascade). Returns `204`
with no body, or `404` with `{"error": "endpoint not found"}`.

## Events

### `POST /api/events`

Publish an event. The API stores the event, creates one delivery per active
subscribed endpoint, and enqueues each delivery on BullMQ.

```bash
curl -X POST http://localhost:3001/api/events \
  -H 'Content-Type: application/json' \
  -d '{"type": "payment.succeeded", "payload": {"id": "evt_1", "amount": 4999, "currency": "usd"}}'
```

Request body:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `type` | string | Yes | Non-empty string, for example `payment.succeeded`. |
| `payload` | object | Yes | Must be a JSON object. |

Returns `201` with the event and a summary of the deliveries created:

```json
{
  "event": {"id": "...", "type": "payment.succeeded", "payload": {...}},
  "deliveries": [{"id": "...", "endpointId": "...", "status": "queued"}]
}
```

Validation failures return `400` with `{"error": "..."}`.

### `POST /api/events/seed`

Publish four sample events with realistic payloads:
`payment.succeeded`, `payment.failed`, `subscription.created`, and
`invoice.paid`. Returns `201` with a per-type summary of events created
and deliveries queued.

## Deliveries

### `GET /api/deliveries`

List deliveries, newest first. Includes the endpoint URL and the event type.

```bash
curl "http://localhost:3001/api/deliveries?status=failed&take=20"
```

Query parameters:

| Parameter | Notes |
| --- | --- |
| `status` | Optional. One of `queued`, `delivering`, `delivered`, `failed`. Anything else returns `400`. |
| `endpointId` | Optional. Filter to one endpoint. |
| `take` | Optional. Default 50, minimum 1, maximum 200. |

### `GET /api/deliveries/:id`

Full delivery detail: the endpoint, the event with its payload, and the
attempts ordered by attempt number. Returns `404` with
`{"error": "delivery not found"}` when the id does not exist.

Each attempt records the attempt number, HTTP status code, response body
(truncated to 4 KB), error message, duration in milliseconds, and the
signature and timestamp that were sent.

## Stats

### `GET /api/stats`

Aggregate counts used by the dashboard cards.

```bash
curl http://localhost:3001/api/stats
```

Response:

```json
{
  "total": 16,
  "delivered": 12,
  "failed": 4,
  "queued": 0,
  "delivering": 0,
  "avgAttempts": 1.9,
  "deliveredPct": 75.0
}
```

`deliveredPct` is rounded to one decimal place and is `0` when there are no
deliveries.

## Delivery headers and signature verification

Every delivery attempt POSTs the raw JSON payload with these headers:

| Header | Value |
| --- | --- |
| `Content-Type` | `application/json` |
| `X-Webhook-Event-Type` | For example `payment.succeeded` |
| `X-Webhook-Delivery-Id` | Delivery id, stable across retries |
| `X-Webhook-Timestamp` | Unix timestamp of the attempt |
| `X-Webhook-Signature` | `t=<ts>,v1=<hex>` |

The signature is `HMAC-SHA256(endpoint_secret, "<ts>.<raw_json_body>")`,
hex-encoded. Receivers recompute the HMAC over the timestamp and the exact
raw body and compare in constant time. Timestamps more than 5 minutes old
are rejected (replay protection). A `verify()` helper lives in
`apps/api/src/lib/sign.ts`.

## Errors

All errors are JSON with an `error` field. Known cases:

| Status | Meaning |
| --- | --- |
| `400` | Invalid request body or query parameter. The message says what is wrong. |
| `404` | Endpoint or delivery not found. |
| `500` | Unexpected failure. If the database is unreachable, a request can fail with a Prisma error; see `docs/development.md`. |
