# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- MIT license, contributing guide, code of conduct, security policy, and
  support guide.
- Issue templates (bug report, feature request) and a pull request template.
- `docs/` guides: architecture, development setup, and API reference.
- CI workflow prepared for GitHub Actions (Node.js install, typecheck,
  build, Prisma schema validation). The workflow file is not yet in the
  repository because it needs to be added through the GitHub web UI.

## [1.0.0] - 2026-10-30

### Added

- Initial public release of the Webhook Delivery and Reliability Platform.
- Express API with endpoints, events, deliveries, and stats routes.
- BullMQ worker on Redis with per-endpoint retry policy and exponential
  backoff (concurrency 10, 10 second delivery timeout).
- Stripe-style HMAC-SHA256 payload signatures (`X-Webhook-Signature`) with a
  `verify()` helper and 5 minute replay tolerance.
- PostgreSQL storage through Prisma, with models for Endpoint, WebhookEvent,
  Delivery, and DeliveryAttempt.
- Next.js 14 dashboard with delivery stats, endpoint management, a
  send-test-event form, and per-delivery detail pages.
- Demo receiver service with ok, slow, flaky, and dead endpoints, plus a seed
  script that registers them and fires sample events.
- Docker Compose setup for Postgres 17, Redis 7, API, worker, demo receiver,
  and dashboard.

### Known gaps

- Docker Compose and the Prisma migration have not been run against a live
  database. The migration in `apps/api/prisma/migrations/0001_init/` was
  hand-authored; run `prisma migrate dev` against a real database and review
  the diff before treating it as canonical.
- No test suite yet. No lint configuration for the API or demo receiver.
- No authentication, authorization, or rate limiting on the API.
