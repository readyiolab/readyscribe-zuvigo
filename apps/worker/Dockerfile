FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* turbo.json tsconfig.base.json ./
COPY apps/worker/package.json apps/worker/
COPY packages ./packages
RUN pnpm install --frozen-lockfile || pnpm install

FROM base AS builder
COPY --from=deps /app ./
COPY . .
RUN pnpm db:generate && pnpm --filter @zuvigo/worker... build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app ./
CMD ["pnpm", "--filter", "@zuvigo/worker", "start"]
