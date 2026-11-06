## What changed

Describe the change and why it is needed. Link the related issue, if any
(`Fixes #123`).

## How it was verified

List the commands you ran and the result. There is no test suite yet, so
manual verification counts. Be specific.

- [ ] `apps/api`: `npm install && npm run build` passes
- [ ] `apps/demo-receiver`: `npm install && npm run build` passes
- [ ] `apps/web`: `npm install && npm run build` passes
- [ ] Prisma schema validated with `DATABASE_URL` set (`npx prisma validate`)
- [ ] Verified by hand against a running stack (describe below)

Hand verification notes (commands, requests, and what you observed):

## What is still unverified

Anything you could not check: Docker Compose against live services, the
Prisma migration on a real database, behavior without Postgres or Redis, or
anything else. Say so plainly.

## Checklist

- [ ] Docs updated if setup, the API, configuration, or behavior changed
- [ ] `CHANGELOG.md` updated under `[Unreleased]`
- [ ] No secrets, generated files, or unrelated reformatting in the diff
- [ ] No new feature is claimed in the README that is not implemented
