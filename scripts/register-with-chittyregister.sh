#!/usr/bin/env bash
set -euo pipefail

# Registers ChittyFinance with ChittyRegister using an already-issued user token.
# Usage:
#   export CHITTYREGISTER_USER_TOKEN=...   # From ChittyAuth /v1/register bootstrap
#   bash scripts/register-with-chittyregister.sh

REGISTER_URL=${CHITTY_REGISTER_URL:-https://register.chitty.cc}
PAYLOAD=${CHITTY_REGISTER_PAYLOAD:-deploy/registration/chittyfinance.registration.json}

if [[ -z "${CHITTYREGISTER_USER_TOKEN:-}" ]]; then
  echo "ERROR: CHITTYREGISTER_USER_TOKEN not set." >&2
  echo "Obtain it from ChittyAuth /v1/register, then retry." >&2
  exit 1
fi

if [[ ! -f "$PAYLOAD" ]]; then
  echo "ERROR: Payload file not found: $PAYLOAD" >&2
  exit 1
fi

echo "Submitting registration to $REGISTER_URL/api/v1/register ..."
curl -sS -X POST "$REGISTER_URL/api/v1/register" \
  -H "Authorization: Bearer $CHITTYREGISTER_USER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @"$PAYLOAD" | jq . || true

