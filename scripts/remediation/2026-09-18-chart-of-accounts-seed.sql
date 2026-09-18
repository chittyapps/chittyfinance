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
-- ROLLBACK RECIPE (restores the exact pre-state above):
--
-- BEGIN;
-- DELETE FROM chart_of_accounts WHERE tenant_id IS NULL AND modified_by = 'seed:chart-of-accounts'
--   AND code IN ('1130','1900','1910','1920','2045','2540','4005','4008','4070','4080','5015','5025','5055','6050','9040');
-- UPDATE chart_of_accounts SET name='Rental Income', description='Base rent received' WHERE tenant_id IS NULL AND code='4000';
-- UPDATE chart_of_accounts SET schedule_e_line=NULL, description='Security deposits retained' WHERE tenant_id IS NULL AND code='4110';
-- UPDATE chart_of_accounts SET schedule_e_line=NULL WHERE tenant_id IS NULL AND code='4120';
-- UPDATE chart_of_accounts SET schedule_e_line='Line 14' WHERE tenant_id IS NULL AND code='5020';
-- UPDATE chart_of_accounts SET schedule_e_line='Line 7'  WHERE tenant_id IS NULL AND code='5030';
-- UPDATE chart_of_accounts SET schedule_e_line='Line 14' WHERE tenant_id IS NULL AND code='5080';
-- COMMIT;
--
-- A rollback restores data but not the reasoning: 5020/5030/5080 were mapped to lines
-- that belong to other expense kinds, verified against the 2025 Schedule E. Rolling back
-- reinstates those errors.
