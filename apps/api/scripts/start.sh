#!/bin/sh
# Container start-up: apply database migrations, create default plans/admin, start the API.
set -e
cd /app/apps/api
npx prisma migrate deploy
node prisma/bootstrap.js
exec node src/server.js
