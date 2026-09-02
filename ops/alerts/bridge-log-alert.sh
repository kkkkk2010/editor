#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="${CONTAINER_NAME:-editor-editor-1}"
WINDOW="${WINDOW:-5m}"
THRESHOLD="${THRESHOLD:-3}"
ALERT_LOG="${ALERT_LOG:-/var/log/presentonika-alerts.log}"

PATTERN='save-fallback-denied|\bunauthorized\b|\bUNAUTHORIZED\b|UPSTREAM_TIMEOUT|"status":5[0-9][0-9]| status: 5[0-9][0-9]'

if ! command -v docker >/dev/null 2>&1; then
  exit 0
fi

logs="$(docker logs "$CONTAINER_NAME" --since "$WINDOW" 2>&1 || true)"
if [[ -z "$logs" ]]; then
  exit 0
fi

hits="$(printf "%s\n" "$logs" | grep -Eic "$PATTERN" || true)"
if [[ "$hits" -ge "$THRESHOLD" ]]; then
  ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  msg="ALERT bridge-errors container=${CONTAINER_NAME} window=${WINDOW} hits=${hits} threshold=${THRESHOLD}"
  printf "%s %s\n" "$ts" "$msg" | tee -a "$ALERT_LOG" >/dev/null
  logger -t presentonika-alert "$msg" || true
fi
