# syntax=docker/dockerfile:1

# Build context is the monorepo root:
#   docker build -f apps/web/Dockerfile -t mgm-website-frontend .

FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a AS base
RUN corepack enable

# 1. Prune the monorepo down to what `web` actually needs
FROM base AS pruner
WORKDIR /app
COPY . .
# renovate: datasource=npm depName=turbo
ARG TURBO_VERSION=2.10.12
RUN npx --yes turbo@${TURBO_VERSION} prune web --docker

# 2. Install deps and build
FROM base AS builder
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .

ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_API_URL=http://localhost:4000/api
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
# A NEXT_PUBLIC value is built into the browser bundle, so it is public by design and Hadolint's secret warning does not apply
# hadolint ignore=DL3064
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=""
# hadolint ignore=DL3064
ENV NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=${NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
RUN pnpm turbo run build --filter=web

# 3. Final runtime image — Next.js standalone output is already self-contained
FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nextjs && adduser --system --uid 1001 nextjs

# The runtime needs only the node binary. npm, corepack and yarn carry their own
# bundled packages, which scanners report, and nothing at run time calls them.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-*

COPY --from=builder --chown=nextjs:nextjs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nextjs /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/web/server.js"]
