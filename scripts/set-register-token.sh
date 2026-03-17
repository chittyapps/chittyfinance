#!/usr/bin/env bash
set -euo pipefail
# Sets CHITTY_REGISTER_TOKEN on the chittyregister Cloudflare Worker.
# Run from a machine with CLOUDFLARE_API_TOKEN set, or with wrangler auth.
#
# Usage:
#   CLOUDFLARE_API_TOKEN=<token> bash scripts/set-register-token.sh <token-value>
#   # OR from the chittyregister project dir:
#   echo "<token-value>" | wrangler secret put CHITTY_REGISTER_TOKEN --name chittyregister

ACCOUNT_ID="0bc21e3a5a9de1a4cc843be9c3e98121"
WORKER_NAME="chittyregister"
TOKEN_VALUE="${1:?Usage: $0 <token-value>}"

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "ERROR: CLOUDFLARE_API_TOKEN not set." >&2
  echo "Get one at: https://dash.cloudflare.com/profile/api-tokens" >&2
  exit 1
fi

echo "Setting CHITTY_REGISTER_TOKEN on $WORKER_NAME..."
curl -sS -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/scripts/$WORKER_NAME/secrets" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"CHITTY_REGISTER_TOKEN\",\"text\":\"$TOKEN_VALUE\",\"type\":\"secret_text\"}" | jq .

echo "Done. Test with:"
echo "  curl -sS -X POST https://register.chitty.cc/api/v1/register \\"
echo "    -H 'Authorization: Bearer $TOKEN_VALUE' \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    --data @deploy/registration/chittyfinance.registration.json | jq ."
