#!/usr/bin/env bash
# ===========================================================================
# Ophir all-in-one entrypoint.
#
# Boots the bundled observability stack (grafana/otel-lgtm: Grafana + Loki +
# Tempo + Prometheus + OpenTelemetry Collector) and the Ophir API inside a
# single container. Everything talks over localhost.
#
# PostgreSQL is NOT bundled: Ophir uses an EXTERNAL database provided via
# DATABASE_URL (e.g. postgres://user:pass@host:5432/ophir).
# ===========================================================================
set -uo pipefail

log() { echo "[allinone] $*"; }

# --- 1. Require an external database ----------------------------------------
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[allinone] FATAL: DATABASE_URL is required." >&2
  echo "           Point Ophir at an external PostgreSQL, e.g.:" >&2
  echo "           -e DATABASE_URL=postgres://user:pass@host:5432/ophir" >&2
  exit 1
fi

# --- 2. Wire Ophir to the in-container stack (all on localhost) -------------
# Only applied when the operator hasn't overridden them.
export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-8080}"
export NODE_ENV="${NODE_ENV:-production}"
export COLLECTOR_OTLP_HTTP_URL="${COLLECTOR_OTLP_HTTP_URL:-http://127.0.0.1:4318}"
export COLLECTOR_URL="${COLLECTOR_URL:-http://127.0.0.1:13133}"
export LOKI_URL="${LOKI_URL:-http://127.0.0.1:3100}"
export TEMPO_URL="${TEMPO_URL:-http://127.0.0.1:3200}"
export PROMETHEUS_URL="${PROMETHEUS_URL:-http://127.0.0.1:9090}"
export GRAFANA_URL="${GRAFANA_URL:-http://127.0.0.1:3000}"
export GRAFANA_PUBLIC_URL="${GRAFANA_PUBLIC_URL:-http://localhost:3000}"

# --- 3. Grafana hardening (login required by default) -----------------------
export GF_AUTH_ANONYMOUS_ENABLED="${GF_AUTH_ANONYMOUS_ENABLED:-false}"
export GF_USERS_ALLOW_SIGN_UP="${GF_USERS_ALLOW_SIGN_UP:-false}"
[[ -n "${GRAFANA_ADMIN_USER:-}" ]] && export GF_SECURITY_ADMIN_USER="${GRAFANA_ADMIN_USER}"
[[ -n "${GRAFANA_ADMIN_PASSWORD:-}" ]] && export GF_SECURITY_ADMIN_PASSWORD="${GRAFANA_ADMIN_PASSWORD}"

# NOTE: deliberately NOT exporting OTEL_EXPORTER_OTLP_ENDPOINT globally. The
# bundled collector launcher treats that variable as an *additional external*
# export target, which would create a self-loop. Ophir's own Node SDK is
# pinned to the local collector when it starts (see below).

declare -a CHILD_PIDS=()
shutting_down=0
shutdown() {
  [[ "${shutting_down}" == "1" ]] && return
  shutting_down=1
  log "shutting down..."
  kill "${CHILD_PIDS[@]}" 2>/dev/null || true
  wait 2>/dev/null || true
  exit 0
}
trap shutdown SIGTERM SIGINT

# --- 4. Start the bundled LGTM + Collector stack ----------------------------
log "starting Grafana / Loki / Tempo / Prometheus / OpenTelemetry Collector..."
pushd /otel-lgtm >/dev/null
./run-all.sh &
CHILD_PIDS+=("$!")
popd >/dev/null

# --- 5. Wait for the collector to accept telemetry --------------------------
log "waiting for the OpenTelemetry Collector to become ready..."
collector_ready=0
for _ in $(seq 1 90); do
  if curl -sf "http://127.0.0.1:13133/ready" >/dev/null 2>&1; then
    collector_ready=1
    log "OpenTelemetry Collector is ready."
    break
  fi
  sleep 1
done
[[ "${collector_ready}" == "1" ]] || log "WARN: collector not ready yet; starting Ophir anyway."

# --- 6. Run migrations (optional) then start Ophir --------------------------
cd /app
if [[ "${RUN_MIGRATIONS:-true}" == "true" ]]; then
  log "running database migrations..."
  if ! node dist/db/migrate.js; then
    log "FATAL: database migrations failed (check DATABASE_URL / connectivity)."
    shutdown
  fi
else
  log "skipping migrations (RUN_MIGRATIONS=false)."
fi

log "starting Ophir API on ${HOST}:${PORT}..."
# Pin Ophir's self-telemetry to the local collector regardless of any external
# OTEL_EXPORTER_OTLP_ENDPOINT configured for collector fan-out.
OTEL_EXPORTER_OTLP_ENDPOINT="http://127.0.0.1:4318" \
  node --import ./dist/observability/instrumentation.js dist/main.js &
CHILD_PIDS+=("$!")

# --- 7. If any component exits, tear the container down ---------------------
wait -n
log "a component exited; tearing the container down."
shutdown
