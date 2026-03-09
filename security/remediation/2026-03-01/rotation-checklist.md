# Secret Rotation Checklist (2026-03-01)

## Incident Scope
- Historical exposure of hardcoded workflow secrets in `chittyfinance` commit `a683bbb`.
- Potentially affected classes:
  - Session signing secrets
  - Encryption keys used by test/staging/prod where values may have been reused

## Rotation Steps
1. Inventory impacted secrets and stores.
   - GitHub Actions repository secrets
   - Cloudflare/Runtime env secrets
   - 1Password vault entries
   - Any app/runtime `.env` sources

2. Rotate secrets immediately.
   - `SESSION_SECRET`
   - `ENCRYPTION_KEY`
   - Any derived or copied variants used in staging/production

3. Update CI and runtime bindings.
   - Ensure workflows use `${{ secrets.* }}` only
   - Ensure no static secret literals in YAML/scripts/docs

4. Purge history.
   - Run `security/remediation/2026-03-01/purge-history-and-rotate.sh` from a mirror clone
   - Force-push rewritten refs and tags

5. Invalidate stale sessions/tokens.
   - Revoke active sessions signed with old secrets
   - Trigger user re-authentication if applicable

6. Verify and monitor.
   - Re-scan full history for old literals
   - Confirm CI gates enforce no literal secret patterns
   - Monitor auth/session anomalies for 7 days

## Post-rotation Validation
- [ ] Old literals absent from `git rev-list --all` history scans
- [ ] New secrets stored in vault + GitHub Secrets only
- [ ] CI green with security gates enabled
- [ ] Incident ticket includes timeline, blast radius, and closure notes
