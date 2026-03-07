# CI/CD PR Runbook (2026-03-01)

This runbook gives exact branch/commit/PR commands for the repos patched with security gates.

## 1) chittyfinance (`CHITTYAPPS/chittyfinance`)

### Commit A: CI/CD security gates
```bash
cd /Users/nb/Desktop/Projects/github.com/CHITTYAPPS/chittyfinance

git checkout -b sec/cicd-security-gates-2026-03-01

git add .github/workflows/security-gates.yml scripts/security/check-workflow-secrets.sh

git commit -m "ci(security): add workflow secret policy and dependency audit gates"

git push -u origin sec/cicd-security-gates-2026-03-01
```

### Commit B: remediation kit (optional but recommended)
```bash
cd /Users/nb/Desktop/Projects/github.com/CHITTYAPPS/chittyfinance

git add security/remediation/2026-03-01

git commit -m "docs(security): add multi-repo history purge and rotation toolkit"

git push
```

### Open PR
```bash
cd /Users/nb/Desktop/Projects/github.com/CHITTYAPPS/chittyfinance

gh pr create \
  --title "ci(security): enforce secret + dependency gates" \
  --body-file security/remediation/2026-03-01/pr-templates/chittyfinance-pr-body.md \
  --base main \
  --head sec/cicd-security-gates-2026-03-01
```

Notes:
- There is an unrelated local modification in `.claude/mcp.json`. Do not stage it with this PR.

## 2) chittyschema (`CHITTYFOUNDATION/chittyschema`)

```bash
cd /Users/nb/Desktop/Projects/github.com/CHITTYFOUNDATION/chittyschema

git checkout -b sec/cicd-security-gates-2026-03-01

git add .github/workflows/security-gates.yml scripts/security/check-workflow-secrets.sh

git commit -m "ci(security): add workflow secret policy and dependency audit gates"

git push -u origin sec/cicd-security-gates-2026-03-01

gh pr create \
  --title "ci(security): enforce secret + dependency gates" \
  --body-file /Users/nb/Desktop/Projects/github.com/CHITTYAPPS/chittyfinance/security/remediation/2026-03-01/pr-templates/chittyschema-pr-body.md \
  --base main \
  --head sec/cicd-security-gates-2026-03-01
```

## 3) chittychat-data fallback clone (`CHITTYOS/chittycommand/_ext/chittychat-data`)

```bash
cd /Users/nb/Desktop/Projects/github.com/CHITTYOS/chittycommand/_ext/chittychat-data

git checkout -b sec/cicd-security-gates-2026-03-01

git add .github/workflows/security-gates.yml scripts/security/check-workflow-secrets.sh

git commit -m "ci(security): add workflow secret policy and dependency audit gates"

git push -u origin sec/cicd-security-gates-2026-03-01

gh pr create \
  --title "ci(security): enforce secret + dependency gates" \
  --body-file /Users/nb/Desktop/Projects/github.com/CHITTYAPPS/chittyfinance/security/remediation/2026-03-01/pr-templates/chittychat-data-pr-body.md \
  --base main \
  --head sec/cicd-security-gates-2026-03-01
```

## 4) chittyschema fallback clone (`CHITTYOS/chittycommand/_ext/chittyschema`)

```bash
cd /Users/nb/Desktop/Projects/github.com/CHITTYOS/chittycommand/_ext/chittyschema

git checkout -b sec/cicd-security-gates-2026-03-01

git add .github/workflows/security-gates.yml scripts/security/check-workflow-secrets.sh

git commit -m "ci(security): add workflow secret policy and dependency audit gates"

git push -u origin sec/cicd-security-gates-2026-03-01

gh pr create \
  --title "ci(security): enforce secret + dependency gates" \
  --body-file /Users/nb/Desktop/Projects/github.com/CHITTYAPPS/chittyfinance/security/remediation/2026-03-01/pr-templates/chittyschema-pr-body.md \
  --base main \
  --head sec/cicd-security-gates-2026-03-01
```

## 5) Missing local git clones
- `CHITTYOS/chittyapi` has no `.git` directory in this workspace.
- `CHITCOMMIT/chittyOS-data` and canonical `CHITCOMMIT/chittychat-data` clones are missing.

To patch those canonical repos, clone them first and apply:
```bash
cd /Users/nb/Desktop/Projects/github.com/CHITTYAPPS/chittyfinance
./security/remediation/2026-03-01/apply-pr-patches.sh
```
