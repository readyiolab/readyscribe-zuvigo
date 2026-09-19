# ZuvigoScribe

Production-oriented SaaS foundation for capturing browser workflows and turning them into editable step-by-step guides.

## Stack

- **apps/web** — Next.js 16 + React 19 + Tailwind 4 + shadcn
- **apps/worker** — BullMQ workers (capture, screenshots, AI, email)
- **apps/extension** — Chrome Manifest V3 capture extension
- **packages/** — shared domain modules (`db`, `auth`, `security`, `queue`, `storage`, `ai`, `capture`, …)
- **MySQL** + **Prisma**, **Redis** + **BullMQ**, **DigitalOcean Spaces** (S3-compatible)

## Prerequisites

- Node.js 22+
- pnpm 9+
- Docker Desktop (for MySQL + Redis)

## Setup

```bash
cd zuvigoscribe

# Install
pnpm install

# Environment
cp .env.example .env
# Edit AUTH_SECRET (32+ chars). Optional: Spaces, OpenAI, Google OAuth.

# Infrastructure
docker compose up -d

# Database (Compose MySQL is on host port 3307 — see DATABASE_URL in .env)
pnpm db:generate
pnpm --filter @zuvigo/db run migrate:deploy
pnpm db:seed

# Build packages once
pnpm build
```

## Develop

```bash
# Web (http://localhost:3000) + worker
pnpm dev

# Extension (separate terminal)
pnpm --filter @zuvigo/extension build
# Chrome → Extensions → Load unpacked → apps/extension/dist
```

## Auth

- Email + password
- Magic link (logged in API/worker logs in development)
- Google OAuth when `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are set

Sign up creates a default workspace automatically.

## Capture flow

1. Sign in on the web app and copy your workspace id from `/api/v1/me`
2. Load the extension, open the side panel
3. Paste workspace id + API base `http://localhost:3000`
4. Start Capture → perform actions → Complete
5. Worker builds heuristic steps, processes screenshots, runs AI (or falls back)
6. Edit in `/editor/:scribeId`, publish, view at `/s/:publicId`

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Turbo: web + worker |
| `pnpm build` | Build all packages/apps |
| `pnpm typecheck` | Typecheck monorepo |
| `pnpm test` | Unit tests (authz, config, …) |
| `pnpm db:migrate` | Prisma migrate dev |
| `pnpm db:seed` | Seed plans + demo workspace |

## Docker (production images)

```bash
docker build -f apps/web/Dockerfile -t zuvigo-web .
docker build -f apps/worker/Dockerfile -t zuvigo-worker .
```

Local Compose only runs MySQL + Redis; run Node apps on the host for DX.

## Security notes

- Passwords and secrets from captured pages are never stored
- Object storage is private; clients use short-lived signed URLs
- Authorization is workspace-membership + role based (`AuthzService`)
- Never commit `.env`
