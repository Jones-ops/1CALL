# Image for the API and the worker (same code, different command).
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV FFMPEG_PATH=/usr/bin/ffmpeg

# Install only the server workspaces (not the Expo app).
COPY package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/api/prisma apps/api/prisma
RUN npm install --omit=dev --no-audit --no-fund \
      -w @1call/shared -w @1call/api -w @1call/worker --include-workspace-root=false \
  && cd apps/api && npx prisma generate

COPY packages/shared packages/shared
COPY apps/api apps/api
COPY apps/worker apps/worker

ENV NODE_ENV=production
EXPOSE 4000
CMD ["sh", "/app/apps/api/scripts/start.sh"]
