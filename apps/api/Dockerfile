# syntax=docker/dockerfile:1

# Build context is the monorepo root:
#   docker build -f apps/api/Dockerfile -t website-api .

FROM node:22-alpine AS base
RUN corepack enable

# 1. Prune the monorepo down to what `api` actually needs
FROM base AS pruner
WORKDIR /app
COPY . .
RUN npx turbo prune api --docker

# 2. Install full (dev + prod) deps for the pruned workspace and build
# --ignore-scripts: apps/api's postinstall runs `prisma generate`, which needs
# prisma/schema.prisma — that file only exists after the out/full/ copy below.
FROM base AS builder
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY --from=pruner /app/out/full/ .
RUN pnpm --filter api exec prisma generate
RUN pnpm turbo run build --filter=api

# 3. Install production-only deps for the pruned workspace
# --ignore-scripts here too: the generated Prisma client is copied in from the
# builder stage's compiled dist output instead, so postinstall has nothing to do.
FROM base AS prod-deps
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

# 4. Final runtime image
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nestjs && adduser --system --uid 1001 nestjs

COPY --from=prod-deps --chown=nestjs:nestjs /app ./
COPY --from=builder --chown=nestjs:nestjs /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=nestjs:nestjs /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder --chown=nestjs:nestjs /app/packages/shared/dist ./packages/shared/dist

USER nestjs
WORKDIR /app/apps/api
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["sh", "-c", "pnpm exec prisma migrate deploy --schema prisma/schema.prisma && node dist/main.js"]
