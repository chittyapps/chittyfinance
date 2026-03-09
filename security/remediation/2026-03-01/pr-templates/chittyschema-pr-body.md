## Summary
Adds CI/CD security gates for secret policy enforcement and dependency audit.

## Changes
- Adds `.github/workflows/security-gates.yml`
- Adds `scripts/security/check-workflow-secrets.sh`

## Why
- Prevent hardcoded secret patterns from entering workflows.
- Enforce high-severity dependency audit checks in CI.

## Validation
- `./scripts/security/check-workflow-secrets.sh` passes.
- `security-gates.yml` parsed successfully.
