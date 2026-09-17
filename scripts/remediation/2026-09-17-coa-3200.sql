-- COA 3200 remediation — applied 2026-09-17 to Neon project solitary-rice-14149088,
-- database chittyfinance, main branch.
--
-- 3200 is not in REI_CHART_OF_ACCOUNTS. Importers wrote it as suggested_coa_code on
-- 1,199 rows, and the bulk-accept gate in client/src/pages/Classification.tsx would
-- have promoted 887 of them to authoritative coa_code. The write path was fixed in
-- #141; this script corrects the historical rows.
--
-- This is a record of what ran, not a migration to re-apply. It first ran on
-- branch br-cool-math-akl631g0 and produced identical counts there. Every statement
-- is guarded by suggested_coa_code = '3200', so a second run is a no-op.
--
-- Scope: suggestions only (coa_code IS NULL, reconciled = false). Authoritative and
-- reconciled rows are untouched.
--   amazon              -> 3010 Owner Draws (rows are flagged personalUse), confidence kept
--   reihub, mercury_csv -> 9010 Suspense at confidence 0.100, which is below the bulk-accept threshold
--
-- Observed on main:
--   suggested 3010: 30 -> 398, 9010: 5155 -> 5986, 3200: 1199 -> 0
--   classification_audit rows added: 368 (3010) + 831 (9010)
--   authoritative rows touched: 0

BEGIN;

INSERT INTO classification_audit (
  transaction_id, tenant_id, previous_coa_code, new_coa_code, action, trust_level,
  actor_id, actor_type, confidence, reason, metadata
)
SELECT
  t.id,
  t.tenant_id,
  '3200',
  CASE WHEN t.metadata->>'source' = 'amazon' THEN '3010' ELSE '9010' END,
  're-suggest',
  'L1',
  'claude-code:session_01W2qFSSKdbsxo7AS8Buo247',
  'agent',
  CASE WHEN t.metadata->>'source' = 'amazon' THEN t.classification_confidence ELSE 0.100 END,
  CASE WHEN t.metadata->>'source' = 'amazon'
    THEN 'COA 3200 is not in REI_CHART_OF_ACCOUNTS. Row is flagged personalUse; Owner Draws is 3010. Suggestion corrected; confidence unchanged.'
    ELSE 'COA 3200 is not in REI_CHART_OF_ACCOUNTS. The importer used it as a catch-all across operating, payable, equity and income source accounts, so no single real account is implied. Routed to suspense 9010 for human review and removed from bulk-accept.'
  END,
  jsonb_build_object(
    'remediation', 'coa-3200-2026-09-17',
    'source', t.metadata->>'source',
    'previousConfidence', t.classification_confidence,
    'rehearsedOnBranch', 'br-cool-math-akl631g0'
  )
FROM transactions t
WHERE t.suggested_coa_code = '3200'
  AND t.coa_code IS NULL
  AND t.reconciled = false
  AND t.metadata->>'source' IN ('amazon', 'reihub', 'mercury_csv');

UPDATE transactions
SET suggested_coa_code = '3010', updated_at = now()
WHERE suggested_coa_code = '3200'
  AND coa_code IS NULL
  AND reconciled = false
  AND metadata->>'source' = 'amazon';

UPDATE transactions
SET suggested_coa_code = '9010', classification_confidence = 0.100, updated_at = now()
WHERE suggested_coa_code = '3200'
  AND coa_code IS NULL
  AND reconciled = false
  AND metadata->>'source' IN ('reihub', 'mercury_csv');

COMMIT;

-- Verification (read-only):
--   SELECT suggested_coa_code, COUNT(*) FROM transactions
--    WHERE suggested_coa_code IN ('3200','3010','9010') GROUP BY 1;
--   SELECT new_coa_code, COUNT(*) FROM classification_audit
--    WHERE metadata->>'remediation' = 'coa-3200-2026-09-17' GROUP BY 1;
