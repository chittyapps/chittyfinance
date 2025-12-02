#!/usr/bin/env bash
set -euo pipefail

# Home cleanup utility for macOS/Linux developers
# - Scans for largest items under ~
# - Prunes common dev caches (npm/yarn/pnpm/pip), logs, __pycache__
# - Optional sections (commented) for Docker, Xcode, Android, Homebrew

echo "=== Home cleanup starting ($(date)) ==="

HOMEDIR="$HOME"
DOWNLOADS="$HOME/Downloads"
PROJECTS_DIRS=("$HOME/Projects" "$HOME/project" "$HOME/work" "$HOME/dev")

echo "\n-- Disk usage (top 20 under ~) --"
du -h -d 1 "$HOMEDIR" 2>/dev/null | sort -h | tail -n 20 || true

echo "\n-- Find large files (>500M) under Downloads --"
find "$DOWNLOADS" -type f -size +500M -print 2>/dev/null | sed 's/^/  /' || true

echo "\n-- Prune common caches --"
{
  npm cache verify 2>/dev/null || true
  npm cache clean --force 2>/dev/null || true
} || true

{ yarn cache clean 2>/dev/null || true; } || true
{ pnpm store prune 2>/dev/null || true; } || true
{ pip cache purge 2>/dev/null || true; } || true

echo "\n-- Remove Python __pycache__ dirs --"
find "$HOMEDIR" -type d -name "__pycache__" -prune -exec rm -rf {} + 2>/dev/null || true

echo "\n-- Remove big logs (>10M) under ~ --"
find "$HOMEDIR" -type f -name "*.log" -size +10M -delete 2>/dev/null || true

if [[ "$(uname -s)" == "Darwin" ]]; then
  echo "\n-- macOS: clear user caches --"
  rm -rf "$HOME/Library/Caches"/* 2>/dev/null || true

  echo "-- macOS: Xcode DerivedData --"
  rm -rf "$HOME/Library/Developer/Xcode/DerivedData"/* 2>/dev/null || true
  echo "-- macOS: CoreSimulator caches --"
  rm -rf "$HOME/Library/Developer/CoreSimulator/Caches"/* 2>/dev/null || true

  # Homebrew cleanup (safe)
  if command -v brew >/dev/null 2>&1; then
    echo "\n-- Homebrew cleanup --"
    brew cleanup -s || true
    brew autoremove || true
  fi
fi

echo "\n-- Old node_modules (>90 days): deleting --"
for dir in "${PROJECTS_DIRS[@]}"; do
  [[ -d "$dir" ]] || continue
  while IFS= read -r nm; do
    echo "Removing: $nm"
    rm -rf "$nm" || true
  done < <(find "$dir" -type d -name node_modules -mtime +90 -prune -print 2>/dev/null)
done

echo "\n-- Docker cleanup --"
if command -v docker >/dev/null 2>&1; then
  docker system df || true
  docker system prune -f || true
  docker image prune -a -f || true
  docker volume prune -f || true
else
  echo "docker not found; skipping"
fi

echo "\n=== Cleanup complete. Recheck disk usage: du -h -d 1 ~ | sort -h ==="
