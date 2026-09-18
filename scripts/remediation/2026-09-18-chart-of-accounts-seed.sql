-- Chart of accounts: apply the #157 chart to production — 2026-09-18
-- Neon project solitary-rice-14149088, database chittyfinance, main branch.
--
-- Operator-approved. Applies the 15 accounts added by #157 and corrects the 6 rows
-- whose names or Schedule E lines were wrong, bringing the production table in line
-- with docs/CHART-OF-ACCOUNTS.md (authoritative) and database/chart-of-accounts.ts
-- (its projection, CI-enforced to match).
--
-- Pre-state, captured immediately before applying:
--   80 global rows (tenant_id IS NULL), all is_active, modified_by NULL on every row,
--   metadata and parent_code NULL on every row.
--   digest md5(code|name|type|schedule_e_line|description|is_active, ordered by code)
--     = 0bccb10d9c9dd36c3471623f537ae95b
--
-- Applied through the Neon MCP rather than `pnpm db:seed:coa --apply`, because the CLI
-- needs DATABASE_URL and no credential was handled in this session. The statements are
-- the same INSERT/UPDATE shapes the seed emits (tenant_id IS NULL scoped, modified_by
-- preserved on updates). The one thing this path does NOT do is emit the seed's per-row
-- ledger and chronicle events — this file is the audit record in their place.
--
-- The seed remains idempotent afterwards: a later `--apply` run over this state plans
-- 0 inserts, 0 updates.

BEGIN;

-- 6 corrections. modified_by is deliberately NOT set: it is NULL on every production
-- row today, and the seed preserves prior attribution rather than claiming authorship.

UPDATE chart_of_accounts SET name = 'Rental Income - Long-Term',
  description = 'Base rent received on unfurnished, year-length leases', updated_at = now()
 WHERE tenant_id IS NULL AND code = '4000';

UPDATE chart_of_accounts SET schedule_e_line = 'Line 3',
  description = 'Security deposits retained; income only on forfeiture, otherwise a 2010 liability',
  updated_at = now()
 WHERE tenant_id IS NULL AND code = '4110';

UPDATE chart_of_accounts SET schedule_e_line = 'Line 3', updated_at = now()
 WHERE tenant_id IS NULL AND code = '4120';

-- 5020 and 5030 both sat on lines that belong to the other kind of expense:
-- Schedule E line 7 is Cleaning and maintenance, line 8 is Commissions.
UPDATE chart_of_accounts SET schedule_e_line = 'Line 7', updated_at = now()
 WHERE tenant_id IS NULL AND code = '5020';

UPDATE chart_of_accounts SET schedule_e_line = 'Line 8', updated_at = now()
 WHERE tenant_id IS NULL AND code = '5030';

-- Supplies is line 15, not 14 (Repairs).
UPDATE chart_of_accounts SET schedule_e_line = 'Line 15', updated_at = now()
 WHERE tenant_id IS NULL AND code = '5080';

-- 15 new accounts.
INSERT INTO chart_of_accounts (id, tenant_id, code, name, type, subtype, description, schedule_e_line, is_active, modified_by)
VALUES
 (gen_random_uuid(), NULL, '1130', 'Due from Affiliate', 'asset', 'receivable', 'Standing inter-entity receivable; mirrors the affiliate''s 2540', NULL, true, 'seed:chart-of-accounts'),
 (gen_random_uuid(), NULL, '1900', 'Transfer Clearing - Intra-Entity', 'asset', 'clearing', 'Both legs of a movement between two accounts of the same entity; nets to zero', NULL, true, 'seed:chart-of-accounts'),
 (gen_random_uuid(), NULL, '1910', 'Transfer Clearing - Intercompany', 'asset', 'clearing', 'Both legs of a movement between entities; nets to zero', NULL, true, 'seed:chart-of-accounts'),
 (gen_random_uuid(), NULL, '1920', 'Payment Rail Holding', 'asset', 'clearing', 'Venmo/Zelle/cash in flight until the far side is known', NULL, true, 'seed:chart-of-accounts'),
 (gen_random_uuid(), NULL, '2045', 'Buy-Now-Pay-Later Payable', 'liability', 'payable', 'Affirm, Afterpay and similar financed purchases', NULL, true, 'seed:chart-of-accounts'),
 (gen_random_uuid(), NULL, '2540', 'Due to Affiliate', 'liability', 'payable', 'Standing inter-entity payable; mirrors the affiliate''s 1130', NULL, true, 'seed:chart-of-accounts'),
 (gen_random_uuid(), NULL, '4005', 'Rental Income - Mid-Term Furnished', 'income', NULL, 'Furnished stays of 30+ days; passive rental income', 'Line 3', true, 'seed:chart-of-accounts'),
 (gen_random_uuid(), NULL, '4008', 'Rental Income - All-Inclusive', 'income', NULL, 'Rent with utilities bundled', 'Line 3', true, 'seed:chart-of-accounts'),
 (gen_random_uuid(), NULL, '4070', 'Management Income', 'income', NULL, 'Fees earned managing property for others; 1065 page 1 gross receipts', NULL, true, 'seed:chart-of-accounts'),
 (gen_random_uuid(), NULL, '4080', 'Other Business Income', 'income', NULL, 'Amazon KDP and other non-rental revenue; 1065 page 1', NULL, true, 'seed:chart-of-accounts'),
 (gen_random_uuid(), NULL, '5015', 'Contract Labor (1099)', 'expense', NULL, 'Non-employee labor; 1099-NEC source. Not wages — Form 8825 line 17 Other', 'Line 19', true, 'seed:chart-of-accounts'),
 (gen_random_uuid(), NULL, '5025', 'Furnishings & Decor', 'expense', NULL, 'Furnishings below the capitalization threshold; above it capitalize to 1610', 'Line 19', true, 'seed:chart-of-accounts'),
 (gen_random_uuid(), NULL, '5055', 'Litigation - Arias', 'expense', NULL, 'Litigation costs segregated from ordinary legal fees for the recovery waterfall', 'Line 10', true, 'seed:chart-of-accounts'),
 (gen_random_uuid(), NULL, '6050', 'AI & Compute', 'expense', NULL, 'Model APIs and compute (Anthropic, OpenAI and similar)', 'Line 19', true, 'seed:chart-of-accounts'),
 (gen_random_uuid(), NULL, '9040', 'Data Quality Hold', 'expense', 'suspense', 'Source data is broken (bad payee, epoch date); not a pending human decision', NULL, true, 'seed:chart-of-accounts');

COMMIT;

-- Verification (read-only):
--   SELECT COUNT(*) FROM chart_of_accounts WHERE tenant_id IS NULL;              -- expect 95
--   SELECT code, name, schedule_e_line FROM chart_of_accounts
--    WHERE tenant_id IS NULL AND code IN ('4000','4110','4120','5020','5030','5080');
--   SELECT COUNT(*) FROM chart_of_accounts
--    WHERE tenant_id IS NULL AND modified_by IS NOT NULL;                        -- expect 15
--
-- ROLLBACK RECIPE (restores every column this script touched, including updated_at):
--
-- BEGIN;
-- DELETE FROM chart_of_accounts WHERE tenant_id IS NULL AND modified_by = 'seed:chart-of-accounts'
--   AND code IN ('1130','1900','1910','1920','2045','2540','4005','4008','4070','4080','5015','5025','5055','6050','9040');
-- UPDATE chart_of_accounts SET name='Rental Income', description='Base rent received',
--   updated_at='2026-04-18T16:49:51.312741+00' WHERE tenant_id IS NULL AND code='4000';
-- UPDATE chart_of_accounts SET schedule_e_line=NULL, description='Security deposits retained',
--   updated_at='2026-04-18T16:49:51.312741+00' WHERE tenant_id IS NULL AND code='4110';
-- UPDATE chart_of_accounts SET schedule_e_line=NULL,
--   updated_at='2026-04-18T16:49:51.312741+00' WHERE tenant_id IS NULL AND code='4120';
-- UPDATE chart_of_accounts SET schedule_e_line='Line 14',
--   updated_at='2026-04-18T16:49:58.86112+00'  WHERE tenant_id IS NULL AND code='5020';
-- UPDATE chart_of_accounts SET schedule_e_line='Line 7',
--   updated_at='2026-04-18T16:49:58.86112+00'  WHERE tenant_id IS NULL AND code='5030';
-- UPDATE chart_of_accounts SET schedule_e_line='Line 14',
--   updated_at='2026-04-18T16:49:58.86112+00'  WHERE tenant_id IS NULL AND code='5080';
-- COMMIT;
--
-- The updated_at values above are the rows' originals, captured in the same read as
-- the digest below. With them the rollback is exact for every column this script
-- touches; created_at was never modified.
--
-- A rollback restores data but not the reasoning: 5020/5030/5080 were mapped to lines
-- that belong to other expense kinds, verified against the 2025 Schedule E. Rolling back
-- reinstates those errors.

-- ═══════════════════════════════════════════════════════════════════════════════════
-- CORRECTION — appended 2026-09-18. Nothing above this line has been altered; the
-- record of what was executed stays as it was executed. This block records what that
-- execution got wrong.
--
-- THE DEFECT: the INSERT above omits `tax_deductible` from its column list.
--
--   (id, tenant_id, code, name, type, subtype, description, schedule_e_line,
--    is_active, modified_by)
--
-- All fifteen inserted rows therefore took the schema default — `taxDeductible:
-- boolean('tax_deductible').notNull().default(false)` in database/system.schema.ts.
-- For eleven of the fifteen, false is correct. For four it is not: the authoritative
-- chart (docs/CHART-OF-ACCOUNTS.md, projected in database/chart-of-accounts.ts) marks
-- them taxDeductible = true.
--
--   5015  Contract Labor (1099)
--   5025  Furnishings & Decor
--   5055  Litigation - Arias
--   6050  AI & Compute
--
-- Confirmed against production (read-only, Neon project solitary-rice-14149088,
-- database chittyfinance, main branch), all four:
--   tax_deductible = false, modified_by = 'seed:chart-of-accounts',
--   created_at = updated_at = 2026-09-18T02:16:34.545Z
--
-- The seed script's own TypeScript insert is NOT affected — it spreads the whole
-- projected row (`.values({ tenantId: null, ...row, ... })`), so it has always carried
-- tax_deductible. The defect is confined to this hand-written SQL, which was used
-- instead of the seed because no DATABASE_URL was handled in that session.
--
-- TWO CLAIMS IN THE HEADER ABOVE ARE FALSE AS A RESULT:
--   1. "bringing the production table in line with docs/CHART-OF-ACCOUNTS.md" — it does
--      not; four rows diverge from the authoritative chart on tax_deductible.
--   2. "The seed remains idempotent afterwards: a later `--apply` run over this state
--      plans 0 inserts, 0 updates" — false when written. tax_deductible was already in
--      PERSISTED_FIELDS, so a seed run over this state plans 4 updates with
--      'taxDeductible' in changedFields. Verified against the tree as it stood at the
--      commit that recorded this apply — `git show 8125cff:database/seeds/chart-of-
--      accounts.ts` has PERSISTED_FIELDS = [name, type, subtype, description,
--      scheduleELine, taxDeductible]. (parentCode joined that list later, in #171, so
--      a seed run today plans parent_code updates too — unrelated, and intended.)
--
-- THE ROLLBACK RECIPE ABOVE CANNOT RESTORE THIS. It is exact for every column the apply
-- actually wrote, but "restores every column this script touched" describes a narrower
-- set than the header implies: a column the apply never wrote has no pre-state to
-- restore, and rolling the inserts back DELETEs those rows outright, so tax_deductible
-- does not arise. Rollback is not the remedy here; a forward correction is.
--
-- CORRECTIVE SQL — **NOT APPLIED**. Recorded for the audit trail and as the statement a
-- manual correction would use. Do not run it as part of reading this file: the pending
-- operator-approved seed apply supersedes it. computeSeedPlan() reports these same four
-- codes as updates with 'taxDeductible' in changedFields, so
-- `pnpm db:seed:coa -- --apply` corrects them along with everything else it plans, and
-- emits the per-row ledger and chronicle events this hand-written path never did.
--
-- UPDATE chart_of_accounts SET tax_deductible = true, updated_at = now()
--  WHERE tenant_id IS NULL AND code IN ('5015','5025','5055','6050');
--
-- Verification after whichever path is taken (read-only):
--   SELECT code, tax_deductible FROM chart_of_accounts
--    WHERE tenant_id IS NULL AND code IN ('5015','5025','5055','6050');   -- expect 4x true
--
-- HOW THIS SURVIVED REVIEW, and what now catches it: the seed's insert test asserted
-- `expect(call.sql).toContain('"parent_code"')`. Drizzle builds a compiled INSERT's
-- column list from the TABLE definition, not from the keys of `.values()`, so every
-- column of chart_of_accounts appears in the SQL text whether or not it is written; an
-- omitted column appears only as the literal `default` in the VALUES tuple, consuming no
-- bound parameter. The assertion was therefore true of any insert whatsoever. It has
-- been replaced with a check on the values actually bound, per column — see
-- server/__tests__/chart-of-accounts-seed.test.ts.
