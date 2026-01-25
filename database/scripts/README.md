# Database Scripts

## Orphan Check for Transaction Foreign Keys

Before applying the `onDelete('set null')` constraints to the `transactions` table's `propertyId` and `unitId` foreign keys, you should check for orphaned references.

### Quick Manual Check

If you have `psql` installed and DATABASE_URL configured:

```bash
psql $DATABASE_URL -f database/scripts/check-orphaned-transactions.sql
```

### Using the Node.js Script

Prerequisites:
- `npm install` (to get pg dependency)
- DATABASE_URL environment variable set

```bash
node database/scripts/run-orphan-check.mjs
```

### What It Checks

The orphan check looks for:
1. Transactions with a `property_id` that references a non-existent property
2. Transactions with a `unit_id` that references a non-existent unit

### Expected Output

**If no orphans found:**
```
✅ No orphaned references found!
   All transaction.propertyId and transaction.unitId references are valid.
   Safe to apply onDelete constraints.
```

**If orphans found:**
```
⚠️  Orphaned references found:

   Orphaned Property References: 3 transactions
   Transaction IDs: uuid1, uuid2, uuid3

   Orphaned Unit References: 1 transactions
   Transaction IDs: uuid4
```

### Fixing Orphaned References

If orphaned references are found, you have two options:

1. **Set to NULL** (recommended for nullable columns):
   ```sql
   UPDATE transactions 
   SET property_id = NULL 
   WHERE property_id NOT IN (SELECT id FROM properties);
   
   UPDATE transactions 
   SET unit_id = NULL 
   WHERE unit_id NOT IN (SELECT id FROM units);
   ```

2. **Delete the transactions** (if they're invalid data):
   ```sql
   DELETE FROM transactions 
   WHERE property_id NOT IN (SELECT id FROM properties)
      OR unit_id NOT IN (SELECT id FROM units);
   ```

### Applying Schema Changes

After confirming no orphans exist (or fixing them), apply the schema changes:

```bash
npm run db:push
```

This will add the `onDelete('set null')` constraint to the foreign keys, ensuring that when a property or unit is deleted, the related transactions have their `property_id` or `unit_id` set to NULL instead of causing a foreign key violation.
