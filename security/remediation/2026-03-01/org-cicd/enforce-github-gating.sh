#!/usr/bin/env bash
set -euo pipefail

# Enforce required CI/CD gating across owners/repos.
# Modes:
#   --mode repo-protection  (default) : apply branch protection per repo
#   --mode org-ruleset               : create org-level rulesets (requires admin:org)
#
# Defaults are non-destructive dry run unless --apply is set.

MODE="repo-protection"
APPLY="false"
LIMIT="0"

OWNERS=(chittyapps chittyfoundation chittyos chitcommit furnished-condos chittycorp)
CHECK_CONTEXTS=(
  "Security Gates / Workflow Secret Policy"
  "Security Gates / Working Tree Secret Scan"
  "Security Gates / Dependency Audit (High+)"
)

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      MODE="$2"; shift 2 ;;
    --apply)
      APPLY="true"; shift ;;
    --limit)
      LIMIT="$2"; shift 2 ;;
    --owner)
      OWNERS=("$2"); shift 2 ;;
    *)
      echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="./security/remediation/2026-03-01/org-cicd/output-$TS"
mkdir -p "$OUT_DIR"
REPORT="$OUT_DIR/report.tsv"

echo -e "owner\trepo\tdefault_branch\taction\tresult\tmessage" > "$REPORT"

json_contexts() {
  local first=true
  printf '['
  for c in "${CHECK_CONTEXTS[@]}"; do
    if [[ "$first" == true ]]; then first=false; else printf ','; fi
    printf '{"context":"%s"}' "$c"
  done
  printf ']'
}

apply_repo_protection() {
  local owner="$1"
  local repo="$2"
  local branch="$3"

  local has_gate="false"
  if gh api "repos/$owner/$repo/contents/.github/workflows/security-gates.yml" >/dev/null 2>&1; then
    has_gate="true"
  fi

  if [[ "$has_gate" != "true" ]]; then
    echo -e "$owner\t$repo\t$branch\trepo-protection\tskipped\tsecurity-gates.yml missing" >> "$REPORT"
    return 0
  fi

  local payload
  payload=$(cat <<JSON
{
  "required_status_checks": {
    "strict": true,
    "checks": $(json_contexts)
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "require_last_push_approval": false
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": true,
  "lock_branch": false,
  "allow_fork_syncing": true
}
JSON
)

  if [[ "$APPLY" != "true" ]]; then
    echo -e "$owner\t$repo\t$branch\trepo-protection\tdry-run\twould apply required checks + PR reviews" >> "$REPORT"
    return 0
  fi

  if gh api --method PUT "repos/$owner/$repo/branches/$branch/protection" --input - <<<"$payload" >/dev/null 2>&1; then
    echo -e "$owner\t$repo\t$branch\trepo-protection\tapplied\tbranch protection updated" >> "$REPORT"
  else
    local err
    err=$(gh api --method PUT "repos/$owner/$repo/branches/$branch/protection" --input - <<<"$payload" 2>&1 || true)
    echo -e "$owner\t$repo\t$branch\trepo-protection\tfailed\t${err//$'\n'/ }" >> "$REPORT"
  fi
}

create_org_ruleset() {
  local org="$1"

  if ! gh api "orgs/$org" >/dev/null 2>&1; then
    echo -e "$org\\t<org-ruleset>\\t\\torg-ruleset\\tskipped\\towner is not an org or inaccessible" >> "$REPORT"
    return 0
  fi

  local ruleset_payload
  ruleset_payload=$(cat <<'JSON'
{
  "name": "Org Security Gates",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "include": ["~DEFAULT_BRANCH"],
      "exclude": []
    },
    "repository_name": {
      "include": ["~ALL"],
      "exclude": []
    }
  },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "required_linear_history" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 1,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": true
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [
          { "context": "Security Gates / Workflow Secret Policy" },
          { "context": "Security Gates / Working Tree Secret Scan" },
          { "context": "Security Gates / Dependency Audit (High+)" }
        ]
      }
    }
  ]
}
JSON
)

  if [[ "$APPLY" != "true" ]]; then
    echo -e "$org\t<org-ruleset>\t\torg-ruleset\tdry-run\twould create/update org ruleset" >> "$REPORT"
    return 0
  fi

  if gh api --method POST "orgs/$org/rulesets" --input - <<<"$ruleset_payload" >/dev/null 2>&1; then
    echo -e "$org\t<org-ruleset>\t\torg-ruleset\tapplied\torg ruleset created" >> "$REPORT"
  else
    local err
    err=$(gh api --method POST "orgs/$org/rulesets" --input - <<<"$ruleset_payload" 2>&1 || true)
    echo -e "$org\t<org-ruleset>\t\torg-ruleset\tfailed\t${err//$'\n'/ }" >> "$REPORT"
  fi
}

count=0
for owner in "${OWNERS[@]}"; do
  if [[ "$MODE" == "org-ruleset" ]]; then
    create_org_ruleset "$owner"
    continue
  fi

  repos=$(gh repo list "$owner" --limit 300 --json name,isArchived,defaultBranchRef --jq '.[] | select(.isArchived==false) | [.name, (.defaultBranchRef.name // "")] | @tsv' 2>/dev/null || true)
  if [[ -z "$repos" ]]; then
    echo -e "$owner\t<none>\t\trepo-protection\tskipped\tno repos or no access" >> "$REPORT"
    continue
  fi

  while IFS=$'\t' read -r repo branch; do
    [[ -z "$repo" ]] && continue
    [[ -z "$branch" ]] && { echo -e "$owner\t$repo\t\trepo-protection\tskipped\tno default branch" >> "$REPORT"; continue; }
    apply_repo_protection "$owner" "$repo" "$branch"

    count=$((count+1))
    if [[ "$LIMIT" != "0" && "$count" -ge "$LIMIT" ]]; then
      break 2
    fi
  done <<< "$repos"
done

echo "Wrote report: $REPORT"
awk -F'\t' 'NR==1{next}{k=$5; c[k]++} END{for (i in c) printf "%s\t%d\n", i, c[i] }' "$REPORT" | sort > "$OUT_DIR/summary.txt"
cat "$OUT_DIR/summary.txt"
