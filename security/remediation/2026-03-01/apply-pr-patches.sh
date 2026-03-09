#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-/Users/nb/Desktop/Projects/github.com}"
PATCH_DIR="${PATCH_DIR:-$(pwd)/security/remediation/2026-03-01/pr-patches}"

# repo_id|primary_path|fallback_path|patch_file
TARGETS=(
  "chittyapps/chittyfinance|$ROOT_DIR/CHITTYAPPS/chittyfinance||chittyfinance-security-gates.patch"
  "chittyos/chittyapi|$ROOT_DIR/CHITTYOS/chittyapi||chittyapi-security-gates.patch"
  "chitcommit/chittyOS-data|$ROOT_DIR/CHITCOMMIT/chittyOS-data||chittyOS-data-security-gates.patch"
  "chitcommit/chittychat-data|$ROOT_DIR/CHITCOMMIT/chittychat-data|$ROOT_DIR/CHITTYOS/chittycommand/_ext/chittychat-data|chittychat-data-security-gates.patch"
  "chittyfoundation/chittyschema|$ROOT_DIR/CHITTYFOUNDATION/chittyschema|$ROOT_DIR/CHITTYOS/chittycommand/_ext/chittyschema|chittyschema-security-gates.patch"
)

for row in "${TARGETS[@]}"; do
  IFS='|' read -r repo_id primary fallback patch_file <<< "$row"
  repo_path="$primary"

  if [[ ! -d "$repo_path/.git" && -n "$fallback" && -d "$fallback/.git" ]]; then
    repo_path="$fallback"
  fi

  echo "== $repo_id =="
  if [[ ! -d "$repo_path/.git" ]]; then
    echo "skip: no git repo at $primary${fallback:+ or $fallback}"
    echo
    continue
  fi

  patch_path="$PATCH_DIR/$patch_file"
  if [[ ! -f "$patch_path" ]]; then
    echo "skip: patch not found: $patch_path"
    echo
    continue
  fi

  echo "applying $patch_file to $repo_path"
  git -C "$repo_path" apply "$patch_path"
  echo "applied"
  echo

done
