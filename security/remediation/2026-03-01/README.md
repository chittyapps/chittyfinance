# Multi-Repo Remediation Kit (2026-03-01)

This directory contains both deliverables requested:
- (A) runnable history-scan + purge + rotation assets
- (B) ready PR patch files for security hardening

## A) Scan + Purge + Rotation
- `multi-repo-history-scan-and-purge.sh`
  - `--scan-only` (default): scans all target repos and writes outputs to `output/`
  - `--purge`: runs `git-filter-repo --replace-text` per repo using `replacements/*.txt`
- `replacements/*.txt`
  - one file per repo id (`/` replaced by `__`)
  - fill these with exact literals discovered by scans
- `rotation-checklist.md`
- `command-bundle.md`
- `history-scan-findings.md`

## B) PR Patches
- `pr-patches/chittyfinance-security-gates.patch`
- `pr-patches/chittyapi-security-gates.patch`
- `pr-patches/chittyOS-data-security-gates.patch`
- `pr-patches/chittychat-data-security-gates.patch`
- `pr-patches/chittyschema-security-gates.patch`

All patch files add:
- `scripts/security/check-workflow-secrets.sh`
- `.github/workflows/security-gates.yml`

## Apply Patches
Use:
- `apply-pr-patches.sh`

This script maps target repo ids to local paths and skips missing clones.

## Local Path Notes (this workstation)
- Present git repos:
  - `CHITTYAPPS/chittyfinance`
  - `CHITTYFOUNDATION/chittyschema`
  - fallback mirrors under `CHITTYOS/chittycommand/_ext/*`
- Missing as git clones here:
  - `CHITTYOS/chittyapi` (working tree only, no `.git`)
  - `CHITCOMMIT/chittyOS-data`
  - `CHITCOMMIT/chittychat-data` (used fallback `_ext/chittychat-data`)
