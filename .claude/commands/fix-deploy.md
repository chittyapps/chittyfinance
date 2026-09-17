---
description: Fix critical deployment blockers
---

Execute deployment readiness fixes in priority order:

1. Check for syntax errors (duplicate imports, type errors)
2. Verify database schema consistency
3. Test mode detection (standalone vs system)
4. Validate environment configuration
5. Run type check: `npm run check`

After each fix:
- Update todo list
- No verbose explanations
- Report: "Fixed [file]:[line] - [issue]"

On completion:
- Run `npm run check`
- Output deployment readiness score
