# History Secret Scan Findings (2026-03-01)

## Scope
- `/Users/nb/Desktop/Projects/github.com/CHITTYAPPS/chittyfinance`
- `/Users/nb/Desktop/Projects/github.com/CHITTYFOUNDATION/chittyschema`
- `/Users/nb/Desktop/Projects/github.com/CHITTYOS/chittycommand/_ext/chittychat-data`

Notes:
- `chittyapi` path exists locally at `CHITTYOS/chittyapi` but is not a git repo clone in this workspace, so full git-history scanning could not be run there.

## Confirmed Exposures
### 1) Hardcoded `SESSION_SECRET` in workflow history
- Repo: `CHITTYAPPS/chittyfinance`
- Commit: `a683bbb` (`2025-06-23`)
- File at commit: `.github/workflows/ci.yml`
- Evidence line in historical blob:
  - `-e SESSION_SECRET="test-secret-key-for-github-actions-testing"`

### 2) Hardcoded `ENCRYPTION_KEY` in workflow history
- Repo: `CHITTYAPPS/chittyfinance`
- Commit: `a683bbb` (`2025-06-23`)
- File at commit: `.github/workflows/ci.yml`
- Evidence line in historical blob:
  - `-e ENCRYPTION_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"`

### 3) Additional hardcoded test secrets in historical security workflow
- Repo: `CHITTYAPPS/chittyfinance`
- Commit: `a683bbb` (`2025-06-23`)
- File at commit: `.github/workflows/security.yml`
- Evidence lines in historical blob:
  - `SESSION_SECRET: "test-secret-for-security-headers-check"`
  - `ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"`

## Current-Tree Checks
- No live `ghp_`, `sk_live_`, `AKIA`, or private key blocks were found in the current checked-out trees for the scanned git repos.
- `chittyfinance` currently still has policy risks:
  - Local dependency: `@chittyos/chittyconnect": "file:../chittyconnect"` in `package.json`
  - `npm audit --omit=dev` currently reports high vulnerabilities in this environment.

## Immediate Handling
1. Rotate any secrets potentially derived from or reused from these historical values.
2. Purge exposed literals from git history (command bundle in this folder).
3. Enforce CI gates to prevent recurrence (workflow added separately).
