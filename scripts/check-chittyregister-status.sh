#!/usr/bin/env bash
set -euo pipefail

# Checks the status of the chittyfinance registration.
# Usage:
#   bash scripts/check-chittyregister-status.sh

REGISTER_URL=${CHITTY_REGISTER_URL:-https://register.chitty.cc}
SERVICE_NAME=${SERVICE_NAME:-chittyfinance}

echo "Querying status for $SERVICE_NAME ..."
curl -sS "$REGISTER_URL/api/v1/status?service=$SERVICE_NAME" | jq . || true

