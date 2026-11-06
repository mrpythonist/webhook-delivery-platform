# Development

## Prerequisites

- Node.js 20 or later and npm.
- Docker and Docker Compose for the full stack, or PostgreSQL 17 and Redis 7
  running locally.
- Git.

## Repository layout

```text
.
├── apps/
│   ├── api/            # Express API + BullMQ worker (TypeScript)
│   │   ├── prisma/     # Prisma schema and the initial migration
│   │   └── src/        # index.ts, worker.ts, seed.ts, db.ts, queue.ts, lib/
│   ├── web/            # Next.js 14 dashboard (TypeScript, Tailwind)
│   └── demo-receiver/  # Demo customer endpoints: ok, slow, flaky, dead
├── .env.example        # Copy to .env for local runs
├── docker-compose.yml  # Postgres, Redis, API, worker, demo receiver, dashboard
└── docs/               # Architecture, development, API reference, screenshots
```

Each app under `apps/` is a separate npm package with its own
`package.json` and `package-lock.json`. There is no root package manager
workspace; install and run each app on its own.

## Running the full stack with Docker Compose

```bash
cp .env.example .env
docker compose up --build
```

This starts PostgreSQL, Redis, the API on :3001, the worker, the demo
receiver on :3002, and the dashboard on :3000. Then seed demo data:

```bash
cd apps/api
npm install
API_URL=http://localhost:3001 DEMO_RECEIVER_URL=http://localhost:3002 npm run seed
```

Note: Docker Compose has not been run against live services in the
environment where these docs were written (no Docker available). The compose
file is present and reviewed, but not executed. If you run it and find a
problem, please open an issue.

## Running services locally (without Docker)

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

## Scripts

There is no test suite and no root script. Per app:

| App | Command | What it does |
| --- | --- | --- |
| `apps/api` | `npm run dev` | Run the API with `tsx watch` on :3001 |
| `apps/api` | `npm run worker` | Run the BullMQ worker with `tsx` |
| `apps/api` | `npm run build` | Typecheck and compile to `dist/` (`tsc`) |
| `apps/api` | `npm start` | Run the compiled API (`node dist/index.js`) |
| `apps/api` | `npm run seed` | Register demo endpoints and fire sample events |
| `apps/api` | `npx prisma validate` | Validate the Prisma schema (needs `DATABASE_URL` set) |
| `apps/api` | `npx prisma migrate deploy` | Apply migrations to the database |
| `apps/web` | `npm run dev` | Run the dashboard on :3000 |
| `apps/web` | `npm run build` | Production build (`next build`, includes its own linting and type checking) |
| `apps/web` | `npm start` | Serve the production build on :3000 |
| `apps/demo-receiver` | `npm run dev` | Run with `tsx watch` on :3002 |
| `apps/demo-receiver` | `npm run build` | Typecheck and compile to `dist/` (`tsc`) |
| `apps/demo-receiver` | `npm start` | Run the compiled receiver (`node dist/index.js`) |

Notes:

- `apps/api` and `apps/demo-receiver` have no `lint` or `test` script. Do not
  invent one when documenting or scripting CI.
- `apps/web` has a `lint` script (`next lint`), but it does not work yet:
  there is no ESLint configuration in the repository, so running it stops
  and asks how to configure ESLint instead of linting (verified
  2026-11-06, exit code 1). `npm run build` runs its own linting and type
  checking step and passes. Do not use `npm run lint` as a gate until an
  ESLint config is added.
- Installing `apps/api` runs its `postinstall` step (`prisma generate`),
  which regenerates the Prisma client.
- `npx prisma validate` fails without `DATABASE_URL` set, because the schema
  reads it with `env("DATABASE_URL")`. Set it to any Postgres URL; validate
  does not connect to the database.

## Environment variables

Copy `.env.example` to `.env` for local runs. Inside Docker Compose the
`DATABASE_URL` and `REDIS_URL` values are overridden by the service
environment in `docker-compose.yml`.

| Variable | Default | Used by |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://webhooks:webhooks@localhost:5432/webhooks` | API, worker (Prisma) |
| `REDIS_URL` | `redis://localhost:6379` | API, worker (BullMQ) |
| `PORT` | `3001` (API), `3002` (demo receiver) | API, demo receiver |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` | Dashboard (build-time; must be browser-reachable) |
| `API_URL` | `http://localhost:3001` | Seed script |
| `DEMO_RECEIVER_URL` | `http://localhost:3002` | Seed script |

The `webhooks`/`webhooks` credentials in `.env.example` and
`docker-compose.yml` are local development placeholders only. Change them
before any shared or internet-facing use.

## What runs without PostgreSQL and Redis

Verified on this machine on 2026-11-06 (Node v24.22.1, no Postgres, no Redis,
no Docker). Real terminal output is kept in `docs/screenshots/`.

- `npm run build` passes for the API and the demo receiver.
- `npx prisma validate` passes with `DATABASE_URL` set.
- The API starts and `GET /api/health` returns
  `{"ok":true,"service":"webhook-platform-api",...}`. The Redis client logs
  connection errors in the background but the health endpoint still answers.
- The demo receiver starts and `GET /health` returns
  `{"ok":true,"service":"demo-receiver",...}`; `POST /ok` returns
  `{"received":true}`.
- The dashboard builds with `npm run build`. (Result recorded in
  `docs/screenshots/web-build.txt`.)

What does not run without them:

- Any DB-backed API route (`/api/endpoints`, `/api/events`,
  `/api/deliveries`, `/api/stats`) needs a reachable PostgreSQL. Without
  `DATABASE_URL` set, a request to `/api/stats` fails with a Prisma
  initialization error and the API process exits. Set `DATABASE_URL` and run
  Postgres before using those routes.
- The worker needs both PostgreSQL and Redis. Without Redis it cannot
  consume jobs, so no delivery is attempted.

## Troubleshooting

- **`Error: Environment variable not found: DATABASE_URL`** from Prisma:
  set `DATABASE_URL` in your shell or `.env` before running Prisma commands
  or starting the API.
- **Redis connection errors in the API log on startup:** Redis is not
  reachable at `REDIS_URL`. The health endpoint still works, but event
  publishing will fail because jobs cannot be enqueued.
- **Dashboard shows "Failed to reach the API":** the dashboard fetches the
  API from the browser, so `NEXT_PUBLIC_API_URL` must be reachable from your
  browser, not just from the server. It is baked in at build time for the
  Docker image (`docker-compose.yml` passes it as a build arg).
- **Port already in use:** the API defaults to :3001, the dashboard to
  :3000, the demo receiver to :3002. Check what else is listening before
  assuming the service failed to start.
- **Deliveries stuck in `queued`:** check the worker logs. If the worker is
  not running, or Redis is down, jobs sit in the queue and nothing is
  attempted.
