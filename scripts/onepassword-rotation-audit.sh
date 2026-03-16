#!/usr/bin/env bash
# 1Password Secret Rotation Audit
# Reads .github/secret-catalog.json and validates rotation compliance
set -euo pipefail

CATALOG=".github/secret-catalog.json"
REPORT_DIR="reports/secret-rotation"
mkdir -p "$REPORT_DIR"

if [ ! -f "$CATALOG" ]; then
  echo "::error::Secret catalog not found: $CATALOG"
  exit 1
fi

if ! command -v op &>/dev/null; then
  echo "::warning::1Password CLI not available — skipping rotation audit"
  echo '{"status":"skipped","reason":"op CLI not available"}' > "$REPORT_DIR/report.json"
  exit 0
fi

if [ -z "${OP_SERVICE_ACCOUNT_TOKEN:-}" ]; then
  echo "::warning::OP_SERVICE_ACCOUNT_TOKEN not set — skipping rotation audit"
  echo '{"status":"skipped","reason":"no service account token"}' > "$REPORT_DIR/report.json"
  exit 0
fi

violations=0
total=0
now=$(date +%s)
results="[]"

while IFS= read -r secret; do
  name=$(echo "$secret" | jq -r '.name')
  op_ref=$(echo "$secret" | jq -r '.op_ref')
  rotation_days=$(echo "$secret" | jq -r '.rotation_days')
  total=$((total + 1))

  # Query 1Password for last edit date
  last_edited=$(op item get "$op_ref" --format json 2>/dev/null | jq -r '.updated_at // .created_at // empty' || echo "")

  if [ -z "$last_edited" ]; then
    echo "::warning::Could not fetch rotation info for $name"
    continue
  fi

  last_epoch=$(date -d "$last_edited" +%s 2>/dev/null || echo "0")
  days_since=$(( (now - last_epoch) / 86400 ))

  if [ "$days_since" -gt "$rotation_days" ]; then
    echo "::error::Secret $name is $days_since days old (max: $rotation_days)"
    violations=$((violations + 1))
  else
    echo "✅ $name: $days_since/$rotation_days days"
  fi

  results=$(echo "$results" | jq --arg n "$name" --arg d "$days_since" --arg m "$rotation_days" \
    '. + [{"name": $n, "days_since_rotation": ($d|tonumber), "max_days": ($m|tonumber), "compliant": (($d|tonumber) <= ($m|tonumber))}]')
done < <(jq -c '.secrets[]' "$CATALOG")

# Write report
echo "$results" | jq '{status: "complete", total: '"$total"', violations: '"$violations"', secrets: .}' > "$REPORT_DIR/report.json"

echo "---"
echo "Audit complete: $total secrets checked, $violations violation(s)"

if [ "$violations" -gt 0 ]; then
  exit 1
fi
