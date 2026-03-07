# Command Bundle: History Scan + Purge

## 1) Verify exposed literals in history (chittyfinance)
```bash
cd /Users/nb/Desktop/Projects/github.com/CHITTYAPPS/chittyfinance

git show a683bbb:.github/workflows/ci.yml | nl -ba | sed -n '112,121p'
git show a683bbb:.github/workflows/security.yml | nl -ba | sed -n '159,163p'
```

## 2) Full-history checks for known literals (post-purge should return nothing)
```bash
cd /path/to/mirror/or/clone

git grep -n "test-secret-key-for-github-actions-testing" $(git rev-list --all)
git grep -n "test-secret-for-security-headers-check" $(git rev-list --all)
git grep -n "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" $(git rev-list --all)
```

## 3) Purge workflow literals from history
```bash
cd /Users/nb/Desktop/Projects/github.com/CHITTYAPPS/chittyfinance
bash security/remediation/2026-03-01/purge-history-and-rotate.sh
```

## 4) Re-clone/reset guidance for collaborators after force-push
```bash
# safest
git clone <repo-url>

# or hard reset existing clone (destructive)
git fetch --all --prune
git checkout main
git reset --hard origin/main
git gc --prune=now
```

## 5) Re-scan available local repos
```bash
for repo in \
  /Users/nb/Desktop/Projects/github.com/CHITTYAPPS/chittyfinance \
  /Users/nb/Desktop/Projects/github.com/CHITTYFOUNDATION/chittyschema \
  /Users/nb/Desktop/Projects/github.com/CHITTYOS/chittycommand/_ext/chittychat-data; do
  echo "== $repo =="
  cd "$repo"
  git grep -n "test-secret-key-for-github-actions-testing" $(git rev-list --all) || true
  git grep -n "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" $(git rev-list --all) || true
done
```

## Note on missing git clone
- Local path `/Users/nb/Desktop/Projects/github.com/CHITTYOS/chittyapi` is not a git repo clone in this workspace, so history-level commands were not runnable there.
