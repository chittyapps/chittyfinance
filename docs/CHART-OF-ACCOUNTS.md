# Chart of Accounts

Definition of the ChittyFinance chart of accounts, the dimensions that sit beside it,
and how external sources map onto both.

Status: **proposal**. Nothing here has been applied to the production
`chart_of_accounts` table. Codes marked NEW do not exist yet.

Measured against production Neon on 2026-09-17: 12,522 transactions, 80 accounts,
5,986 rows (48%) sitting in suspense.

## 1. Principles

1. **One dimension per field.** An account code says *what kind of money movement*
   this is. It never encodes which property, which entity, or what state a row is in.
   Those are separate columns: `property_id`, `unit_id`, `tenant_id`, and the
   classification/reconciliation fields.
2. **Every emitted code must exist.** An importer may only emit a code present in this
   document. Codes are validated with `getAccountByCode()` before they are written.
   COA 3200 — a code no account ever had — reached 1,199 live rows precisely because
   nothing enforced this (remediated in #149).
3. **No catch-all codes.** When a rule cannot choose an account, it emits suspense
   (9010) at low confidence. Suspense is a work queue, not a category.
4. **Transfers are not income or expense.** Moving money between accounts the business
   controls changes no profit. See §4.
5. **Suggestions are not classifications.** Importers and agents write
   `suggested_coa_code` (trust L1). Only a human or an L2+ actor writes `coa_code`.

## 2. Ranges

| Range | Meaning |
|-------|---------|
| 1000–1899 | Assets |
| 1900–1999 | Clearing and holding accounts (§4) |
| 2000–2999 | Liabilities |
| 3000–3999 | Equity |
| 4000–4999 | Revenue |
| 5000–5999 | Property operating expenses (Schedule E lines) |
| 6000–6999 | Business administration |
| 7000–7999 | Capitalized improvements |
| 9000–9999 | Control, personal, and workflow accounts |

## 3. Proposed additions

The 80 existing accounts stay as they are. These are additions, each justified by rows
currently unclassifiable without it. Row counts are suspense rows matching that pattern
on 2026-09-17.

### Clearing (the largest gap)

| Code | Name | Type | Why |
|------|------|------|-----|
| 1900 | Transfer Clearing — Intra-Entity | asset | NEW. Moves between two accounts of the same entity. ~1,220 suspense rows, $470K. |
| 1910 | Transfer Clearing — Intercompany | asset | NEW. Moves between entities (ARIBIA ↔ IT CAN BE ↔ City Studio). Mercury already runs dedicated clearing accounts (`CHIT 2062`, `ARBI 1809`, `CITY 9860`). |
| 1920 | Payment Rail Holding | asset | NEW. Venmo, Zelle, cash, "incoming"/"send" rows that are a rail, not a category, until the far side is known. 695 suspense rows match. |

### Liabilities

| Code | Name | Type | Why |
|------|------|------|-----|
| 2045 | Buy-Now-Pay-Later Payable | liability | NEW. Affirm, Afterpay and similar — 193 suspense rows; Affirm alone is 88 rows, $44K. A financed purchase is a liability draw, not an expense. |
| 2040 | Credit Card Payable | liability | Exists, unused. Amex, Citi, Huntington and other card payments — 453 suspense rows — belong here, not in expense. |
| 2530 | Owner Loan Payable | liability | Exists, unused. The 135 "loan" rows ($47K) need review against it. |

### Revenue — mid-term furnished, not short-term

| Code | Name | Type | Why |
|------|------|------|-----|
| 4000 | Rental Income — Long-Term | income | Existing 4000, scope narrowed to unfurnished leases of a year or so. |
| 4005 | Rental Income — Mid-Term Furnished | income | NEW. The core business: furnished stays of 30 days or more. |
| 4008 | Rental Income — All-Inclusive | income | NEW. Matches Mercury `revenue-all-inclusive-rental`, where utilities are bundled into rent. |
| 4070 | Management Income | income | NEW. Mercury `revenue-management-income`; fees earned managing for others. |
| 4080 | Other Business Income | income | NEW. Amazon KDP and similar non-rental revenue. |

**Tax note.** Mid-term rental means an average stay of 30 days or more. That stays
**passive rental income on Schedule E** and is **not** subject to self-employment tax.
The 7-day average-stay rule that pushes short-term rentals toward Schedule C and
non-passive treatment does not apply here, and neither does the "short-term rental
loophole." Treatment changes only if substantial services (daily housekeeping, meals,
concierge) are provided. Keeping 4005 and 4008 separate from 4000 exists to evidence
average stay length, not to change the schedule.

### Operating expenses

| Code | Name | Type | Why |
|------|------|------|-----|
| 5015 | Contract Labor (1099) | expense | NEW. There is no wages or labor account at all today. Mercury has `expense-labor`. Needed for 1099-NEC reporting. |
| 5025 | Furnishings & Décor | expense | NEW. Mercury `expense-furnishings_decor`. Furnished units buy this constantly; items over the capitalization threshold still go to 1610/7030. |
| 5055 | Litigation — Arias | expense | NEW. Mercury already segregates `expense-LITIGATION-RELATED`. Keeping it out of 5050 (ordinary legal) preserves the recovery-waterfall analysis. |

### Administration

| Code | Name | Type | Why |
|------|------|------|-----|
| 6050 | AI & Compute | expense | NEW. Anthropic, OpenAI and similar — 71 suspense rows. Distinguishable from SaaS in 6010, and it is the cost base the ChittyOS work is measured against. |

### Control

| Code | Name | Type | Why |
|------|------|------|-----|
| 9000 | Owner Personal Expense | expense | Exists, unused. Spotify, Netflix, Apple, Temu and similar — 322 suspense rows — are non-deductible and must not sit in suspense pretending to be pending. |
| 9040 | Data Quality Hold | expense | NEW. Rows that cannot be classified because the source is broken: 113 REI Hub `"(inactive` payee rows, 6 rows dated 1970-01-01. Distinct from "awaiting a human decision". |

## 4. Transfers (structural, not a code)

`transactions.type` currently allows only `income` and `expense` — 12,522 rows, two
values. There is no transfer type, so 1,631 transfer-like rows are forced to be one or
the other, overstating both sides of the P&L. The largest single suspense bucket is
1,220 transfer rows worth $470K.

Required, in this order:

1. Add `transfer` to the `type` domain.
2. Record both legs. The paying account credits, the receiving account debits, and both
   carry the same `metadata.transfer_group`.
3. Book each leg to 1900 (same entity) or 1910 (across entities).
4. Exclude `type='transfer'` from every P&L, Schedule E and consolidated report.
5. Assert the clearing accounts net to zero per period. A non-zero balance means a
   missing leg, which is the point of using a clearing account rather than dropping
   the rows.

Until this exists, no report derived from these rows is trustworthy at the top line.

## 5. Dimensions

`property_id` and `unit_id` exist on `transactions` and are populated on **0 of 12,522
rows**. Per-property profitability is therefore impossible today, although the data
exists upstream: Mercury runs one account per property (City, Loft, Cozy, Villa, Mami,
each with operating, rental income and owner distribution accounts), and REI Hub
carries its own property field.

- **Property** → `property_id` / `unit_id`, derived from the source account.
- **Entity** → `tenant_id` (ARIBIA LLC, IT CAN BE LLC, …).
- **Account** → `coa_code`.

A property must never become an account code. Mercury's `citystudio`, `lakesideloft`,
`cozycastle`, `villa-vista` and `aptarlene` categories are property tags and map to
`property_id`.

## 6. Mercury category mapping

Mercury holds 60 custom categories mixing four dimensions. This table is the mapping
contract; it is not yet implemented.

| Mercury category | Account | Other dimension |
|---|---|---|
| `revenue-rental-income` | 4000 or 4005 by lease length | — |
| `revenue-furnished-rental` | 4005 | — |
| `revenue-all-inclusive-rental` | 4008 | — |
| `revenue-management-income`, `revenue-managementincome` | 4070 | duplicate pair |
| `revenue-fees-application`, `revenue-application-fees` | 4050 | duplicate pair |
| `revenue-fees-parking`, `revenue-parking` | 4030 | duplicate pair |
| `revenue-fees-movein` | 4120 | — |
| `revenue-mixed` | 9010 | needs splitting by hand |
| `expense-repairs` | 5070 | — |
| `expense-cleaning` | 5020 | — |
| `expense-labor` | 5015 | — |
| `expense-supplies` | 5080 | — |
| `expense-furnishings_decor` | 5025 | — |
| `expense-insurance` | 5040 | — |
| `expense-legal` | 5050 | — |
| `expense-LITIGATION-RELATED` | 5055 | — |
| `expense-utilities` | 5100/5110/5120/5130 by utility | — |
| `expense-connectivity` | 5140 | — |
| `expense-hoa`, `expense-association_dues`, `expense-association-dues` | 5200 | duplicate triple |
| `expense-late_fee`, `expense-late-fee` | 5310 | duplicate pair |
| `expense-software` | 6010 | — |
| `expense-marketing` | 5000 | — |
| `expense-travel` | 5010 | — |
| `expense-petty-cash` | 1050 | asset, not expense |
| `expense-capital-improvement` | 7000–7040 by asset | — |
| `expense-discount-or-credit` | contra-revenue against 4000 series | — |
| `mortgage`, `liability-mortgage` | split: 2500 principal, 5300 interest, escrow to 5040/5090 | never book whole to 5300 |
| `liability-credit_card_payment` | 2040 | — |
| `liability-deposits-damage` | 2010 | — |
| `security-deposit-refund` | 2010 | — |
| `liability-arias`, `arias-liability` | 2520 | duplicate pair |
| `member-contribution` | 3000 | — |
| `member-distribution`, `distribution` | 3010 | duplicate pair |
| `transfer` | 1900 | `type='transfer'` |
| `transfer-intracompany` | 1900 | `type='transfer'` |
| `transfer-intercompany` | 1910 | `type='transfer'` |
| `refund` | contra against the original account | — |
| `failed`, `ignore-failed` | excluded | status, not an account |
| `citystudio`, `lakesideloft`, `cozycastle`, `villa-vista`, `villavista`, `aptarlene` | — | `property_id` |
| `it-can-be-llc`, `itcanbellc`, `chitty`, `airbnb` | — | `tenant_id` or channel |
| `expense-shared` | allocation rule, not an account | see `allocation_rules` |

Eleven duplicate pairs exist in Mercury (`villa-vista`/`villavista`,
`expense-late_fee`/`expense-late-fee`, and so on). The mapping accepts both; Mercury
should be tidied separately.

## 7. Source health

| Source | Rows | Suspense | Note |
|---|---|---|---|
| reihub | 6,356 | 55% | Expenses recorded positive; 113 `"(inactive` payees; 6 rows dated 1970-01-01 |
| hdpro | 1,901 | 22% | — |
| amazon | 1,690 | 17% | Best-classified source |
| mercury_csv | 1,589 | 61% | — |
| mercury_webhook | 970 | 85% | The live feed is the worst-classified |

Sign convention: 10,407 rows positive, 2,113 negative. Mercury records expenses
negative; REI Hub, HD Pro and Amazon record them positive. Reports currently paper over
this with `Math.abs`, which works only while nothing nets the two together.

## 8. What this document does not do

- No account has been created, renamed or retired in production.
- No transaction has been reclassified.
- `type='transfer'` does not exist yet; §4 is a specification.
- `property_id` remains unpopulated; §5 is a specification.
- The Mercury mapping in §6 is not implemented in any importer.

Each of those is a separate, separately-approved change.
