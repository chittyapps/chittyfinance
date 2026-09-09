#!/usr/bin/env bash
# Secret rotation audit.
#
# FAIL-CLOSED BY DESIGN. The previous implementation of this audit read
# rotation metadata out of 1Password. That lane is retired (see SECURITY.md),
# and the replacement read against ChittySecrets is not wired yet, so this
# script has no way to learn when a secret was last rotated.
#
# It therefore exits non-zero rather than reporting success. The version it
# replaced did the opposite: it exited 0 with {"status":"skipped"} whenever the
# op CLI or its token was missing -- which was always, since
# OP_SERVICE_ACCOUNT_TOKEN is not a secret on this repository -- so the job
# reported green nightly while auditing nothing. A gate that cannot fail is
# indistinguishable from no gate, except that it also occupies the slot a real
# gate would fill.
#
# To restore real auditing: give ChittySecrets a way to report last-rotated
# per secret name, read it here, and compare against rotation_days in the
# catalog. That is credential-lane work and belongs with
# chittyconnect-concierge.
set -euo pipefail

CATALOG=".github/secret-catalog.json"

if [ ! -f "$CATALOG" ]; then
  echo "::error::Secret catalog not found: $CATALOG"
  exit 1
fi

if ! jq -e '.secrets | length > 0' "$CATALOG" >/dev/null 2>&1; then
  echo "::error::Secret catalog is unparseable or empty: $CATALOG"
  exit 1
fi

COUNT="$(jq '.secrets | length' "$CATALOG")"
BACKEND="$(jq -r '.backend' "$CATALOG")"

echo "Catalog: $COUNT secrets, backend=$BACKEND"
jq -r '.secrets[] | "  - \(.name) — rotate every \(.rotation_days)d — owner \(.owner)"' "$CATALOG"
echo

echo "::error::POLICY_BLOCKED_ROTATION_AUDIT_UNIMPLEMENTED — the ${BACKEND} rotation read is not wired, so rotation compliance for the ${COUNT} catalogued secrets is UNKNOWN, not OK. This job fails deliberately; do not silence it by returning 0."
exit 1
