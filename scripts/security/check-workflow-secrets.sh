#!/usr/bin/env bash
set -euo pipefail

WORKFLOW_DIR=".github/workflows"

if [[ ! -d "$WORKFLOW_DIR" ]]; then
  echo "No workflow directory found; skipping workflow secret checks."
  exit 0
fi

fail=0

# 1) Explicitly blocked historical literals
blocked_literals=(
  "test-secret-key-for-github-actions-testing"
  "test-secret-for-security-headers-check"
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
)

for literal in "${blocked_literals[@]}"; do
  if grep -RIn --include='*.yml' --include='*.yaml' "$literal" "$WORKFLOW_DIR" >/dev/null 2>&1; then
    echo "Blocked literal found in workflow files: $literal"
    grep -RIn --include='*.yml' --include='*.yaml' "$literal" "$WORKFLOW_DIR" || true
    fail=1
  fi
done

# 2) Hardcoded secret-style env assignments in workflows.
# Allow GitHub Secrets interpolation only.
while IFS= read -r line; do
  # line format: file:line:text
  value="${line#*:*:}"
  if [[ "$value" != *'${{ secrets.'* ]]; then
    echo "Hardcoded secret-like workflow assignment found: $line"
    fail=1
  fi
done < <(grep -RInE --include='*.yml' --include='*.yaml' 'SESSION_SECRET\s*:\s*".+"|ENCRYPTION_KEY\s*:\s*".+"' "$WORKFLOW_DIR" || true)

if [[ "$fail" -ne 0 ]]; then
  echo "Workflow secret policy check failed."
  exit 1
fi

echo "Workflow secret policy check passed."
