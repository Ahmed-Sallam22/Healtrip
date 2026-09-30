# syntax=docker/dockerfile:1
# Build context: repository root.  docker build -f apps/api/Dockerfile -t healtrip-api .
FROM node:22-alpine AS base
RUN apk add --no-cache openssl && corepack enable
ENV PNPM_HOME=/pnpm COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /repo

# --- build: install api + shared deps (cached on manifests), compile shared then api
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY apps/api/prisma apps/api/prisma
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@healtrip/api..."
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY data/seed data/seed
RUN pnpm --filter @healtrip/shared build && pnpm --filter @healtrip/api build
# This stage is also used by the one-shot `migrate` service (prisma CLI + ts-node for the seed).
ENV SEED_DATA_DIR=/repo/data/seed

# --- runtime
FROM base AS runtime
ENV NODE_ENV=production PORT=4000
COPY --from=build --chown=node:node /repo /repo
WORKDIR /repo/apps/api
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=5 \
  CMD wget -qO- http://127.0.0.1:4000/api/health >/dev/null || exit 1
CMD ["node", "dist/main.js"]
