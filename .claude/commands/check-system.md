---
description: Validate system mode readiness
---

Run comprehensive system mode validation:

```bash
# 1. Detect current mode
npm run mode:detect

# 2. Check database connection
MODE=system npm run db:push:system --dry-run

# 3. Verify ChittyConnect integration
curl -H "Authorization: Bearer $CHITTYCONNECT_API_TOKEN" \
  ${CHITTYCONNECT_API_BASE}/health

# 4. Test API endpoints
MODE=system npm run dev &
sleep 3
curl http://localhost:5000/api/v1/status
curl http://localhost:5000/health
```

Report results in table format:
- Database: ✓/✗
- ChittyConnect: ✓/✗
- API Health: ✓/✗
- Type Check: ✓/✗
