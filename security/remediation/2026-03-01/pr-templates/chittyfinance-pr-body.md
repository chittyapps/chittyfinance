## Summary
This PR adds enforceable CI/CD security gates to prevent secret reintroduction and catch high-risk dependency issues early.

## Changes
- Adds `.github/workflows/security-gates.yml`
  - workflow secret policy enforcement
  - working-tree secret pattern scan
  - dependency audit gate (high severity)
- Adds `scripts/security/check-workflow-secrets.sh`
  - blocks known leaked literals
  - rejects hardcoded `SESSION_SECRET` / `ENCRYPTION_KEY` workflow values unless sourced from `${{ secrets.* }}`

## Why
- Historical workflow literals were found in repo history and require long-term prevention controls.
- This gate ensures PRs fail before secrets or high-risk dependency issues are merged.

## Validation
- `./scripts/security/check-workflow-secrets.sh` (pass)
- workflow YAML parses successfully.

## Follow-ups
- enforce required status checks in branch protection for `Security Gates`
- complete secret rotation + history purge using the remediation kit (`security/remediation/2026-03-01/`)
