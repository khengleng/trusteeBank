# Trustee Admin Portal — Railway service `trustee-admin-portal` (public ingress,
# domain trustee.cambobia.com). UI-only; talks to the API over HTTPS.
FROM node:18-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/portal-ui/package.json packages/portal-ui/
COPY apps/trustee-admin-portal/package.json apps/trustee-admin-portal/
RUN npm install
COPY packages/portal-ui ./packages/portal-ui
COPY apps/trustee-admin-portal ./apps/trustee-admin-portal
RUN npm run build -w @trustee/portal-ui && npm run build -w @trustee/trustee-admin-portal

FROM node:18-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/trustee-admin-portal/dist ./apps/trustee-admin-portal/dist
COPY --from=build /app/apps/trustee-admin-portal/package.json ./apps/trustee-admin-portal/
COPY --from=build /app/package.json ./package.json
EXPOSE 4000
CMD ["node", "apps/trustee-admin-portal/dist/main.js"]
