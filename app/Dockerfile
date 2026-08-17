# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3001 \
    HOST=0.0.0.0 \
    DATA_ROOT=/app/data \
    PRIVATE_STORAGE_ROOT=/app/data/private \
    TEMP_ROOT=/app/data/tmp \
    JOBS_DIR=/app/data/jobs

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg python3 tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts=false \
    && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY server ./server
COPY pipeline_py ./pipeline_py
COPY scripts ./scripts

RUN groupadd --system --gid 10001 cineassemble \
    && useradd --system --uid 10001 --gid cineassemble --home-dir /app cineassemble \
    && mkdir -p /app/data/private /app/data/tmp /app/data/jobs \
    && chown -R cineassemble:cineassemble /app

USER cineassemble
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl --fail --silent http://127.0.0.1:3001/health/live >/dev/null || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server/index.js"]
