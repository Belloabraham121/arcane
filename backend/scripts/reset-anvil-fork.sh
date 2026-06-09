#!/usr/bin/env bash
# Kill a stuck local Anvil fork and start a fresh one.
set -euo pipefail

PORT="${ANVIL_PORT:-8545}"

echo "Stopping Anvil on port ${PORT}..."
PIDS="$(lsof -ti :"${PORT}" 2>/dev/null || true)"
if [ -n "${PIDS}" ]; then
  # shellcheck disable=SC2086
  kill -9 ${PIDS} 2>/dev/null || true
  sleep 1
fi

echo "Starting fresh Anvil fork..."
exec bash "$(dirname "$0")/start-anvil-fork.sh"
