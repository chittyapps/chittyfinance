#!/usr/bin/env bash
set -euo pipefail

# Multi-repo secret history scan + optional purge orchestrator.
# Usage:
#   ./multi-repo-history-scan-and-purge.sh --scan-only
#   ./multi-repo-history-scan-and-purge.sh --purge --replacements-dir ./replacements
#
# Notes:
# - Non-destructive by default (--scan-only).
# - Purge mode uses git-filter-repo and requires per-repo replacement file.

ROOT_DIR="${ROOT_DIR:-/Users/nb/Desktop/Projects/github.com}"
OUT_DIR="${OUT_DIR:-$(pwd)/security/remediation/2026-03-01/output}"
REPLACEMENTS_DIR="${REPLACEMENTS_DIR:-$(pwd)/security/remediation/2026-03-01/replacements}"
MODE="scan"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --scan-only)
      MODE="scan"
      shift
      ;;
    --purge)
      MODE="purge"
      shift
      ;;
    --root-dir)
      ROOT_DIR="$2"
      shift 2
      ;;
    --out-dir)
      OUT_DIR="$2"
      shift 2
      ;;
    --replacements-dir)
      REPLACEMENTS_DIR="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

mkdir -p "$OUT_DIR"

REPO_IDS=(
  "chittyapps/chittyfinance"
  "chittyos/chittyapi"
  "chitcommit/chittyOS-data"
  "chitcommit/chittychat-data"
  "chittyfoundation/chittyschema"
)

# Local fallback paths in current workstation layout.
resolve_local_path() {
  local repo_id="$1"
  case "$repo_id" in
    chittyapps/chittyfinance)
      echo "$ROOT_DIR/CHITTYAPPS/chittyfinance"
      ;;
    chittyos/chittyapi)
      echo "$ROOT_DIR/CHITTYOS/chittyapi"
      ;;
    chitcommit/chittyOS-data)
      echo "$ROOT_DIR/CHITCOMMIT/chittyOS-data"
      ;;
    chitcommit/chittychat-data)
      echo "$ROOT_DIR/CHITCOMMIT/chittychat-data"
      ;;
    chittyfoundation/chittyschema)
      echo "$ROOT_DIR/CHITTYFOUNDATION/chittyschema"
      ;;
    *)
      echo ""
      ;;
  esac
}

# Alternative known local paths.
resolve_alt_path() {
  local repo_id="$1"
  case "$repo_id" in
    chitcommit/chittychat-data)
      echo "$ROOT_DIR/CHITTYOS/chittycommand/_ext/chittychat-data"
      ;;
    chitcommit/chittyOS-data)
      echo ""
      ;;
    chittyfoundation/chittyschema)
      echo "$ROOT_DIR/CHITTYOS/chittycommand/_ext/chittyschema"
      ;;
    *)
      echo ""
      ;;
  esac
}

sanitize() {
  echo "$1" | tr '/:' '__'
}

scan_repo() {
  local repo_id="$1"
  local repo_path="$2"
  local out_file="$OUT_DIR/$(sanitize "$repo_id")-scan.txt"

  {
    echo "repo_id=$repo_id"
    echo "repo_path=$repo_path"
    echo "timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo

    if [[ ! -d "$repo_path/.git" ]]; then
      echo "status=missing_git"
      return 0
    fi

    echo "status=ok"
    echo "head=$(git -C "$repo_path" rev-parse --short HEAD 2>/dev/null || echo unknown)"
    echo

    echo "[working-tree-pattern-scan]"
    rg -n --hidden --glob '!.git/**' --glob '!node_modules/**' --glob '!dist/**' --glob '!security/remediation/**' \
      'ghp_[A-Za-z0-9]{20,}|sk_live_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|BEGIN (RSA|EC|OPENSSH|PGP)? ?PRIVATE KEY|SESSION_SECRET\s*[:=]\s*"|ENCRYPTION_KEY\s*[:=]\s*"' \
      "$repo_path" || true
    echo

    echo "[history-grep-known-literals]"
    local literals=(
      "test-secret-key-for-github-actions-testing"
      "test-secret-for-security-headers-check"
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    )
    for lit in "${literals[@]}"; do
      echo "-- literal: $lit"
      git -C "$repo_path" --no-pager log --all -G"$lit" --oneline | head -n 20 || true
    done
    echo

    if command -v trufflehog >/dev/null 2>&1; then
      echo "[trufflehog]"
      trufflehog git --repo="file://$repo_path" --json | head -n 200 || true
    else
      echo "[trufflehog] skipped (not installed)"
    fi
  } > "$out_file"

  echo "wrote $out_file"
}

purge_repo() {
  local repo_id="$1"
  local repo_path="$2"
  local repl_file="$REPLACEMENTS_DIR/$(sanitize "$repo_id").txt"

  if [[ ! -d "$repo_path/.git" ]]; then
    echo "[purge] skip $repo_id (missing git repo)"
    return 0
  fi

  if [[ ! -f "$repl_file" ]]; then
    echo "[purge] skip $repo_id (missing replacements file: $repl_file)"
    return 0
  fi

  if ! command -v git-filter-repo >/dev/null 2>&1; then
    echo "[purge] git-filter-repo not installed; cannot purge $repo_id"
    return 1
  fi

  echo "[purge] rewriting $repo_id using $repl_file"
  git -C "$repo_path" filter-repo --replace-text "$repl_file" --force
  echo "[purge] complete for $repo_id"
  echo "[purge] next manual step: force-push all refs and tags for $repo_id"
}

for repo_id in "${REPO_IDS[@]}"; do
  primary="$(resolve_local_path "$repo_id")"
  alt="$(resolve_alt_path "$repo_id")"
  repo_path="$primary"

  if [[ ! -d "$repo_path/.git" && -n "$alt" && -d "$alt/.git" ]]; then
    repo_path="$alt"
  fi

  echo "== $repo_id =="
  scan_repo "$repo_id" "$repo_path"

  if [[ "$MODE" == "purge" ]]; then
    purge_repo "$repo_id" "$repo_path"
  fi

  echo

done

echo "Done. Findings in: $OUT_DIR"
