#!/bin/sh
# Ophir container entrypoint.
# - Runs database migrations unless RUN_MIGRATIONS=false.
# - Starts the API with the OpenTelemetry instrumentation preloaded.
# `exec` makes Node PID 1 so it receives SIGTERM/SIGINT for graceful shutdown.
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[ophir] running database migrations..."
  node dist/db/migrate.js
else
  echo "[ophir] skipping migrations (RUN_MIGRATIONS=false)"
fi

echo "[ophir] starting API on ${HOST:-0.0.0.0}:${PORT:-8080}..."
exec node --import ./dist/observability/instrumentation.js dist/main.js
