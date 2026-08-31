# syntax=docker/dockerfile:1.7

# ---------------------------------------------------------------------------
# InfraGuard AI - frontend image (Next.js standalone output)
#
# Base image pinned by digest; readable tag in the comment. To update:
# `docker buildx imagetools inspect node:<tag>` then replace tag + digest.
# ---------------------------------------------------------------------------
# node:22.13.0-alpine
FROM node@sha256:f2dc6eea95f787e25f173ba9904c9d0647ab2506178c7b5b7c5a3d02bc4af145 AS base
# Install the pinned pnpm directly (avoids corepack's signature-key drift on
# pinned Node images). Keep in sync with `packageManager` in package.json.
ARG PNPM_VERSION=11.24.0
RUN npm install -g "pnpm@${PNPM_VERSION}"
WORKDIR /app

# ---- Dependencies ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store

# ---- Build ----
FROM base AS builder
# NEXT_PUBLIC_* values are baked into the client bundle at build time.
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
ENV BUILD_STANDALONE=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# ---- Runtime ----
# node:22.13.0-alpine (same digest as base)
FROM node@sha256:f2dc6eea95f787e25f173ba9904c9d0647ab2506178c7b5b7c5a3d02bc4af145 AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app

# node:alpine ships a non-root `node` user (uid 1000).
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 3000

# Frontend liveness only: the dedicated /healthz route returns exactly HTTP 200
# when Next.js can serve requests. It never contacts the backend or PostgreSQL.
HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=5 \
    CMD node -e "require('http').get('http://localhost:3000/healthz',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
