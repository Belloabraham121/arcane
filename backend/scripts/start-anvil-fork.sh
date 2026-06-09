#!/usr/bin/env bash
# Fork Somnia mainnet for local QuickSwap impersonation / swap tests.
set -euo pipefail

FORK_URL="${ANVIL_FORK_URL:-https://api.infra.mainnet.somnia.network}"
CHAIN_ID="${ANVIL_CHAIN_ID:-5031}"
PORT="${ANVIL_PORT:-8545}"

if ! command -v anvil >/dev/null 2>&1; then
  echo "anvil not found. Install Foundry: https://book.getfoundry.sh/getting-started/installation"
  exit 1
fi

echo "Starting Anvil fork"
echo "  upstream: $FORK_URL"
echo "  chain-id: $CHAIN_ID"
echo "  rpc:      http://127.0.0.1:$PORT"
echo ""
echo "Then in another terminal:"
echo "  npm run fork:find-whale"
echo "  npm run smoke:trading:cycle -- --email=you@signup-email.com --fork --whale=0x... --force"

exec anvil \
  --fork-url "$FORK_URL" \
  --chain-id "$CHAIN_ID" \
  --port "$PORT" \
  --block-base-fee-per-gas 0
