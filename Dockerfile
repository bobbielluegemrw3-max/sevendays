# Single worker image for all Cloud Run services (08_INFRASTRUCTURE.md).
# The SERVICE env selects which services/<SERVICE>/dist/index.js runs —
# one build, eleven deployments.

FROM node:22-slim AS build
WORKDIR /app
RUN npm install -g pnpm@10.18.1
COPY . .
RUN pnpm install --frozen-lockfile
# Everything except the web app (which deploys to Render, Decision 068).
RUN pnpm exec turbo run build --filter='./services/*'

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
# SERVICE is set per Cloud Run service (batch-worker, chain-worker, ...).
CMD ["sh", "-c", "exec node services/${SERVICE}/dist/index.js"]
