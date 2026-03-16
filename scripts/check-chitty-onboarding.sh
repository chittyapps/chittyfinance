#!/usr/bin/env bash
# Validates .chittyconnect.yml has all required onboarding patterns
set -euo pipefail

FILE="${1:-.chittyconnect.yml}"

if [ ! -f "$FILE" ]; then
  echo "::error::$FILE not found"
  exit 1
fi

REQUIRED_PATTERNS=(
  "certificate"
  "trust_chain"
  "context_consciousness:"
  "enabled:"
  "chittydna:"
  "memorycloude:"
  "synthetic_entity:"
  "classification:"
  "authority_scope:"
  "access_scope:"
  "actor_binding:"
)

errors=0
for pattern in "${REQUIRED_PATTERNS[@]}"; do
  if ! grep -q "$pattern" "$FILE"; then
    echo "::error file=$FILE::Missing required pattern: $pattern"
    errors=$((errors + 1))
  fi
done

if [ "$errors" -gt 0 ]; then
  echo "::error::$errors required onboarding pattern(s) missing from $FILE"
  exit 1
fi

echo "✅ All required onboarding patterns present in $FILE"
