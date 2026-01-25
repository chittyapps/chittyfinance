-- Check for orphaned transactions that reference non-existent properties or units
-- This query should be run BEFORE applying the onDelete('set null') constraint
-- to identify any existing data integrity issues

-- Check for transactions with propertyId that don't exist in properties table
SELECT 
  'Orphaned Property References' as issue_type,
  COUNT(*) as count,
  ARRAY_AGG(t.id) as transaction_ids
FROM transactions t
LEFT JOIN properties p ON t.property_id = p.id
WHERE t.property_id IS NOT NULL AND p.id IS NULL
HAVING COUNT(*) > 0

UNION ALL

-- Check for transactions with unitId that don't exist in units table
SELECT 
  'Orphaned Unit References' as issue_type,
  COUNT(*) as count,
  ARRAY_AGG(t.id) as transaction_ids
FROM transactions t
LEFT JOIN units u ON t.unit_id = u.id
WHERE t.unit_id IS NOT NULL AND u.id IS NULL
HAVING COUNT(*) > 0;

-- If this query returns no rows, there are no orphaned references
-- If it returns rows, you need to fix the data before applying the constraint
