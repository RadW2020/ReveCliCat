# Self-hosted ReveCliCat webhook inbox. Build from the repo root:
#   docker build -f examples/inbox/Dockerfile -t reveclicat-inbox .
#   docker run -p 8788:8788 -e INBOX_TOKEN=s3cret -e RC_WEBHOOK_AUTH="Bearer from-dashboard" -v inbox-data:/data reveclicat-inbox
# Put HTTPS in front (Caddy, your PaaS, Cloudflare) — RevenueCat only posts to https:// URLs.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsup.config.ts ./
COPY src ./src
COPY scenarios ./scenarios
RUN npm run build && npm prune --omit=dev

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8788 INBOX_DATA_DIR=/data
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/scenarios ./scenarios
VOLUME /data
EXPOSE 8788
HEALTHCHECK CMD wget -qO- http://localhost:8788/health || exit 1
CMD ["node", "dist/cli.js", "inbox"]
