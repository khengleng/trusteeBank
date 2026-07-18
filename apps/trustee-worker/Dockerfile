# Trustee worker — Railway service `trustee-webhook-worker` (private, no ingress).
FROM node:18-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat

COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/domain/package.json packages/domain/
COPY packages/cryptography/package.json packages/cryptography/
COPY packages/ledger/package.json packages/ledger/
COPY packages/reserves/package.json packages/reserves/
COPY packages/database/package.json packages/database/
COPY packages/adapters/package.json packages/adapters/
COPY apps/trustee-worker/package.json apps/trustee-worker/
RUN npm install

COPY packages ./packages
COPY apps/trustee-worker ./apps/trustee-worker
RUN npx prisma generate --schema packages/database/prisma/schema.prisma \
 && npm run build -w @trustee/domain -w @trustee/cryptography -w @trustee/ledger \
      -w @trustee/reserves -w @trustee/database -w @trustee/adapters \
 && npm run build -w @trustee/trustee-worker

FROM node:18-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl libc6-compat
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/trustee-worker/dist ./apps/trustee-worker/dist
COPY --from=build /app/apps/trustee-worker/package.json ./apps/trustee-worker/
COPY --from=build /app/package.json ./package.json

CMD ["node", "apps/trustee-worker/dist/main.js"]
