# Org Gating Runbook

## Preconditions
- GitHub CLI authenticated (`gh auth status`)
- For org-level rulesets, token must include `admin:org` scope.
  - Refresh once:
    - `gh auth refresh -h github.com -s admin:org`

## Script
- `security/remediation/2026-03-01/org-cicd/enforce-github-gating.sh`

## 1) Repo-level branch protection rollout (automated)
Dry-run all owners:
```bash
cd /Users/nb/Desktop/Projects/github.com/CHITTYAPPS/chittyfinance
./security/remediation/2026-03-01/org-cicd/enforce-github-gating.sh --mode repo-protection
```

Apply to all owners:
```bash
./security/remediation/2026-03-01/org-cicd/enforce-github-gating.sh --mode repo-protection --apply
```

Apply to one owner only:
```bash
./security/remediation/2026-03-01/org-cicd/enforce-github-gating.sh --mode repo-protection --owner furnished-condos --apply
```

## 2) Org-level rulesets (preferred, requires admin:org)
Dry-run:
```bash
./security/remediation/2026-03-01/org-cicd/enforce-github-gating.sh --mode org-ruleset
```

Apply:
```bash
./security/remediation/2026-03-01/org-cicd/enforce-github-gating.sh --mode org-ruleset --apply
```

## Output
Each run writes:
- `security/remediation/2026-03-01/org-cicd/output-<timestamp>/report.tsv`
- `security/remediation/2026-03-01/org-cicd/output-<timestamp>/summary.txt`

## Current Access Constraint
- With current token scopes (`repo`, `workflow`, `read:org`), org ruleset API returns scope error.
- Repo-level mode can still apply wherever repo admin access exists.
