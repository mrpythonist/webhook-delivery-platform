# Contributing to Webhook Delivery Platform

Thanks for your interest in contributing. This guide covers the setup and the
process. If anything here is out of date, open an issue and say so.

## Code of Conduct

Be respectful and constructive. The full code of conduct is in
`CODE_OF_CONDUCT.md`.

## Getting Started

### Prerequisites

- Node.js 20 or later and npm.
- Docker and Docker Compose for the full stack, or PostgreSQL 17 and Redis 7
  running locally if you prefer to run services without Docker.
- A terminal and git.

### Setup

```bash
git clone https://github.com/mrpythonist/webhook-delivery-platform.git
cd webhook-delivery-platform
cp .env.example .env
docker compose up --build
```

For local development without Docker, see `docs/development.md`. In short:
each app under `apps/` is a separate npm package. Install dependencies and
run the dev script per app (`apps/api`, `apps/web`, `apps/demo-receiver`).

### Verifying your checkout

These commands must pass before you open a pull request. There is no test
suite yet, so the build and lint steps are the verification gate for now.

```bash
cd apps/api && npm install && npm run build
cd ../demo-receiver && npm install && npm run build
cd ../web && npm install && npm run build
cd ../api && DATABASE_URL=postgres://webhooks:webhooks@localhost:5432/webhooks npx prisma validate
```

Notes:

- `apps/api` and `apps/demo-receiver` have no `lint` or `test` script. Do not
  add a lint or test step to CI for them until the script exists in their
  `package.json`.
- `apps/web` has a `lint` script (`next lint`), but it does not work yet:
  there is no ESLint configuration in the repository, so `next lint` stops
  and asks how to configure ESLint instead of linting. `npm run build`
  (which runs its own linting and type checking step) passes. Do not use
  `npm run lint` as a gate until an ESLint config is added.
- The API and worker need a reachable PostgreSQL and Redis to do anything
  beyond the `/api/health` check. See `docs/development.md` for what runs
  without them and what does not.

## Branch and Commit Conventions

- Work on a branch off `main`. Name it by what it does, for example
  `fix/delivery-timeout`, `feat/redelivery-endpoint`, `docs/api-reference`.
- Keep commits small and focused. One logical change per commit.
- Write commit messages in the imperative mood with a short summary line, for
  example: `Add retry count to delivery list response`. Add a body when the
  reason is not obvious from the change.
- Do not commit generated files, dependencies, or local environment files:
  `node_modules/`, `dist/`, `.next/`, `.env`, and `*.log` are gitignored.
- Do not commit secrets. If you find one in the history, report it instead of
  trying to fix it quietly (see `SECURITY.md`).

## Tests

There is no automated test suite in this repository yet. That is a known gap,
listed in `CHANGELOG.md` and on the roadmap in the README.

- If you add a test runner, add the `test` script to the affected
  `package.json` first, then wire it into `.github/workflows/ci.yml`.
- If you change delivery, retry, or signature behavior, describe in your pull
  request how you verified it by hand (commands run and output observed).
  Terminal output captures under `docs/screenshots/` are welcome where they
  prove a behavior.

## Pull Request Process

1. Check existing issues and pull requests to avoid duplicating work. If no
   issue exists for your change, open one first for anything larger than a
   typo fix.
2. Fork the repository, create a branch, and make your change.
3. Run the verification commands above and confirm they pass.
4. Update the docs when your change affects setup, the API, configuration, or
   behavior. Update `CHANGELOG.md` under `[Unreleased]`.
5. Fill in the pull request template: what changed, why, how you verified it,
   and anything that is still unverified.
6. Keep the diff focused. Unrelated reformatting makes review harder.
7. Be ready to answer review comments. Small follow-up commits are fine.

## What Not to Contribute

- Do not add features that depend on a service that is not already in the
  stack (for example, a new database or queue) without discussing it in an
  issue first.
- Do not claim production readiness, uptime, or performance numbers you have
  not measured. The README documents the real limits of this project, and
  contributions should keep it that way.
- Do not rewrite working source code for style alone.

## Reporting Bugs

Use the bug report issue template and include the Node.js version, how you
ran the stack (Docker Compose or local services), the exact command, and the
full error output. See `SUPPORT.md` for what to check first.
