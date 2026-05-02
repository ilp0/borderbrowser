# Multi-stage Dockerfile for self-hosting the BorderBrowser backend.
#
# Build context: the monorepo root (npm workspaces share a lockfile). To build:
#   docker build -f packages/backend/Dockerfile -t borderbrowser-backend .
# Or via docker-compose:
#   docker compose up --build

FROM node:22-alpine AS deps
WORKDIR /app
# Copy the workspace root manifests + every package's manifest so npm can
# resolve workspaces. Sources come later for better layer caching.
COPY package.json package-lock.json ./
COPY packages/backend/package.json packages/backend/
COPY packages/extension/package.json packages/extension/
COPY packages/homepage/package.json packages/homepage/
COPY packages/translator/package.json packages/translator/
RUN npm ci --omit=dev --workspaces=false --include-workspace-root --workspace=@borderbrowser/backend

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# tsx runs the TypeScript entrypoint directly — no compile step needed and
# the source-of-truth lives in one place. tsx is small enough that the
# install cost is negligible.
RUN npm install -g tsx@4
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/backend/node_modules ./packages/backend/node_modules
COPY package.json ./
COPY tsconfig.base.json ./
COPY packages/backend/package.json packages/backend/
COPY packages/backend/tsconfig.json packages/backend/
COPY packages/backend/src packages/backend/src

EXPOSE 8787
WORKDIR /app/packages/backend
CMD ["tsx", "src/server.node.ts"]
