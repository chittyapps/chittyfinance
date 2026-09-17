---
description: Execute full deployment workflow
---

Run complete deployment process:

**Standalone Mode:**
```bash
npm run build:standalone
npm run start  # Test locally
```

**System Mode (Production):**
```bash
# Pre-flight
npm run check
MODE=system npm run db:push:system
npm run db:seed

# Build
npm run build:system

# Deploy to Cloudflare
npm run deploy:production

# Verify
curl https://finance.chitty.cc/health
curl https://finance.chitty.cc/api/v1/status
```

Report:
- Build: ✓/✗ [time]
- Tests: ✓/✗ [count passed/failed]
- Deploy: ✓/✗ [URL]
- Health: ✓/✗ [status code]
