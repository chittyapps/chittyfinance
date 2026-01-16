#!/bin/bash
set -euo pipefail
echo "=== chittyfinance Onboarding ==="
curl -s -X POST "${GETCHITTY_ENDPOINT:-https://get.chitty.cc/api/onboard}" \
  -H "Content-Type: application/json" \
  -d '{"service_name":"chittyfinance","organization":"CHITTYOS","type":"service","tier":4,"domains":["finance.chitty.cc"]}' | jq .
