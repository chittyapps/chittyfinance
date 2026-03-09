#!/usr/bin/env bash
set -euo pipefail

# PURPOSE
# - Purge confirmed exposed secret literals from git history.
# - Force-push rewritten history.
# - Provide a deterministic command bundle for incident response.
#
# IMPORTANT
# - Run from a fresh mirror clone (recommended), not a developer working clone.
# - Coordinate with all collaborators before force-pushing.

REPO_URL="git@github.com:chittyapps/chittyfinance.git"
WORK_DIR="${WORK_DIR:-/tmp/chittyfinance-history-rewrite}"
REPLACEMENTS_FILE="security/remediation/2026-03-01/git-filter-repo-replacements.txt"

rm -rf "$WORK_DIR"
git clone --mirror "$REPO_URL" "$WORK_DIR"
cd "$WORK_DIR"

# Safety snapshot before rewrite
git bundle create ../chittyfinance-prepurge-$(date +%Y%m%d%H%M%S).bundle --all

# Rewrite history
# Requires git-filter-repo installed (https://github.com/newren/git-filter-repo)
git filter-repo --replace-text "$REPLACEMENTS_FILE" --force

# Optional verification (no expected matches after purge)
if git grep -n "test-secret-key-for-github-actions-testing" $(git rev-list --all) >/dev/null 2>&1; then
  echo "ERROR: session test secret still present after rewrite"
  exit 1
fi

if git grep -n "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" $(git rev-list --all) >/dev/null 2>&1; then
  echo "ERROR: encryption key literal still present after rewrite"
  exit 1
fi

# Force-push all refs
# Coordinate this step with maintainers and branch protection settings.
git push --force --all
git push --force --tags

echo "History rewrite complete. Proceed with collaborator re-clone/reset instructions."
