# Trustee API — Railway service `trustee-api-gateway` (public ingress).
# Multi-stage build over the npm workspace monorepo. Build context = repo root.
FROM node:18-alpine AS build
WORKDIR /app
# Prisma requires OpenSSL on Alpine; libc6-compat for native deps.
RUN apk add --no-cache openssl libc6-compat

# Install deps with workspace manifests only (better layer caching).
COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/domain/package.json packages/domain/
COPY packages/cryptography/package.json packages/cryptography/
COPY packages/ledger/package.json packages/ledger/
COPY packages/reserves/package.json packages/reserves/
COPY packages/database/package.json packages/database/
COPY packages/adapters/package.json packages/adapters/
COPY packages/portal-ui/package.json packages/portal-ui/
COPY apps/trustee-api/package.json apps/trustee-api/
RUN npm install

# Copy sources and build in dependency order.
COPY packages ./packages
COPY apps/trustee-api ./apps/trustee-api
RUN npx prisma generate --schema packages/database/prisma/schema.prisma \
 && npm run build -w @trustee/domain -w @trustee/cryptography -w @trustee/ledger \
      -w @trustee/reserves -w @trustee/database -w @trustee/adapters -w @trustee/portal-ui \
 && npm run build -w @trustee/trustee-api

# --- Runtime image ---
FROM node:18-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl libc6-compat
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/trustee-api/dist ./apps/trustee-api/dist
COPY --from=build /app/apps/trustee-api/package.json ./apps/trustee-api/
COPY --from=build /app/package.json ./package.json

EXPOSE 3000
# Apply migrations then start (production requires an approved migration plan; see
# docs/deployment — this runs `migrate deploy`, never destructive `migrate dev`).
CMD ["sh", "-c", "npx prisma migrate deploy --schema packages/database/prisma/schema.prisma && node apps/trustee-api/dist/main.js"]
