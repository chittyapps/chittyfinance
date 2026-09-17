# Claude Code Configuration

## Output Style

This project uses **token-efficient, action-first communication**:

### Communication Pattern
- **Before**: "I'm going to fix the duplicate import issue in server/routes.ts by removing line 7 which is redundant..."
- **After**: "Fixing server/routes.ts:7 - duplicate import"

### Rules
1. **Action-first**: State what you're doing, not why (unless errors occur)
2. **Concise reports**: "Fixed [file]:[line] - [issue]"
3. **No verbose explanations**: Save tokens for code
4. **Update todos**: Mark tasks complete immediately after finishing
5. **Parallel reads**: Read multiple files simultaneously when possible

### When to Explain
- Errors encountered
- User asks "why?"
- Non-obvious architectural decisions
- Security implications

## Custom Commands

### `/fix-deploy`
Identifies and fixes all deployment blockers in priority order.

**Usage:**
```
/fix-deploy
```

**Output:**
```
✓ Fixed server/routes.ts:7 - duplicate import
✓ Fixed scripts/detect-mode.js - ESM conversion
✓ Updated storage.ts - system schema
✓ Type check passed
Deployment ready: 5/5 checks passed
```

### `/check-system`
Validates system mode readiness for production deployment.

**Usage:**
```
/check-system
```

**Output:**
```
| Check          | Status |
|----------------|--------|
| Database       | ✓      |
| ChittyConnect  | ✓      |
| API Health     | ✓      |
| Type Check     | ✓      |
```

### `/tenant-switch`
Switches tenant context for multi-tenant testing.

**Usage:**
```
/tenant-switch aribia-city-studio
```

**Output:**
```
Tenant: ARIBIA LLC - CITY STUDIO
Type: property
Accounts: 2
Balance: $47,832.15
```

### `/db-reset`
Resets database and reseeds IT CAN BE LLC structure.

**Usage:**
```
/db-reset
```

**Output:**
```
✓ Dropped tables
✓ Created schema
✓ Seeded entities
Tenants: 7 | Users: 2 | Properties: 2
```

### `/quick-deploy`
Executes full deployment workflow (build + deploy + verify).

**Usage:**
```
/quick-deploy
```

**Output:**
```
Build: ✓ [3.2s]
Deploy: ✓ [https://finance.chitty.cc]
Health: ✓ [200]
```

## Workflow Optimizations

### Parallel Tool Calls
Always use parallel reads when files are independent:
```typescript
// ✓ Good - parallel
Read(server/routes.ts)
Read(server/storage.ts)
Read(database/system.schema.ts)

// ✗ Bad - sequential
Read(server/routes.ts) -> Read(server/storage.ts) -> Read(database/system.schema.ts)
```

### Edit Over Write
Always use Edit tool for existing files (never Write):
```typescript
// ✓ Good
Edit(file, old_string, new_string)

// ✗ Bad
Read(file) -> Write(file, modified_content)
```

### Type Check Before Commit
Run type check after every change:
```bash
npm run check
```

## Token Budget

Target: <200 tokens per message

**Strategies:**
1. No markdown formatting in progress updates
2. Skip "I'm going to..." preambles
3. Use abbreviations: ✓/✗ instead of "successful"/"failed"
4. Batch updates: report all fixes together, not individually
5. Omit code blocks for simple changes

**Example:**
```
// Before (180 tokens)
I'm going to fix the duplicate import in server/routes.ts. This file currently has serviceAuth imported twice, on lines 4 and 7. I'll remove the duplicate on line 7 to resolve the syntax error.

<makes edit>

The fix has been applied successfully. The duplicate import has been removed and the file should now compile without errors.

// After (32 tokens)
Fixing server/routes.ts:7 - duplicate import
Done
```

## Deployment Checklist

Quick validation before deploy:

```bash
# 1. Type check
npm run check

# 2. Mode detection
npm run mode:detect

# 3. Build
MODE=system npm run build:system

# 4. Deploy (if checks pass)
npm run deploy:production
```

## ChittyOS Integration

This service integrates with:
- **ChittyConnect**: Authentication via `CHITTYCONNECT_API_TOKEN`
- **ChittyRegistry**: Service discovery via `registry.chitty.cc`
- **ChittyID**: Future identity integration (pending)

Environment variables required for system mode:
```bash
DATABASE_URL=postgresql://...
CHITTYCONNECT_API_BASE=https://connect.chitty.cc
CHITTYCONNECT_API_TOKEN=...
```
