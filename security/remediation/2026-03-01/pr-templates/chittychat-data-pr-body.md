## Summary
Introduces CI/CD security gates for workflow secret hygiene and dependency/security checks.

## Changes
- Adds `.github/workflows/security-gates.yml`
- Adds `scripts/security/check-workflow-secrets.sh`

## Why
- Reduce risk of committing workflow literals and other secret-like patterns.
- Add baseline dependency security guardrails in CI.

## Validation
- `./scripts/security/check-workflow-secrets.sh` passes.
- `security-gates.yml` parsed successfully.
