# Chart of Accounts

Definition of the ChittyFinance chart of accounts, oriented to the IRS lines each
account is reported on, plus the dimensions beside it and the Mercury-native
categories and GL codes that feed it.

Status: **proposal**. Nothing here has been applied to the production
`chart_of_accounts` table, to Mercury, or to any transaction. Codes marked NEW do not
exist yet.

Measured against production Neon on 2026-09-17: 12,522 transactions, 80 accounts,
5,986 rows (48%) in suspense.

## 1. Principles

1. **Every account maps to an IRS line.** The chart exists to produce a return. An
   account that maps to no line on Form 8825, Schedule E, Form 1065 page 1 or Form 4562
   should not exist. Where several accounts share one line (utilities, admin), the
   split exists for management reporting and nets back to that line.
2. **One dimension per field.** An account code says *what kind of money movement* this
   is. It never encodes which property, which entity, or what state a row is in. Those
   are `property_id`, `unit_id`, `tenant_id` and the classification fields.
3. **Every emitted code must exist.** Importers may only emit codes in this document,
   validated with `getAccountByCode()`. COA 3200 — a code no account ever had — reached
   1,199 live rows because nothing enforced this (remediated in #149).
4. **No catch-all codes.** When a rule cannot choose, it emits suspense (9010) at low
   confidence. Suspense is a work queue, not a category.
5. **Transfers are not income or expense.** See §5 (flow of funds) and §6 (clearing).
6. **Suggestions are not classifications.** Importers and agents write
   `suggested_coa_code` (L1). Only a human or an L2+ actor writes `coa_code`.

## 2. The forms this chart feeds

ARIBIA LLC files as a partnership, so the rental activity lands on **Form 8825**, which
attaches to **Form 1065**, and flows to each member's **Schedule K-1**. The individual
Schedule E (Form 1040) matters for property held directly and for how the K-1 arrives
on the member's return.

Line numbers verified 2026-09-17 against IRS sources: Form 8825 (Rev. December 2025)
and the 2025 Schedule E (Form 1040).

The two forms do not have the same lines, which drives several decisions below:

| | Form 8825 | Schedule E Part I |
|---|---|---|
| Wages / labor | **line 13** Wages and salaries | no line — goes to Other (19) |
| Supplies | no line — Other (17) | **line 15** Supplies |
| Management fees | no line — Other (17) | **line 11** Management fees |
| Interest | one line (8) | split: mortgage (12), other (13) |
| Taxes | line 10 Real estate taxes | line 16 Taxes |
| Other | line 17, **requires Schedule A (Form 8825)** | line 19, list |

Form 8825 lines 15 and 16 are reserved for future use. Line 17 now requires an attached
Schedule A (Form 8825), so anything falling into "Other" must be itemizable by kind —
which is exactly what the 5200/5320/6000-series accounts below provide.

**Not rental income.** Management fees earned from managing for others (4070) and book
royalties (4080) are service and business revenue, not rental real estate. They belong
on **Form 1065 page 1**, not on Form 8825, and they can carry self-employment exposure
for members that rental income does not. Keeping them in separate accounts is what
makes that separable at filing time.

## 3. Income accounts

| Code | Name | 8825 | Sch E | Note |
|---|---|---|---|---|
| 4000 | Rental Income — Long-Term | 2a | 3 | Unfurnished, year-ish leases |
| 4005 | Rental Income — Mid-Term Furnished | 2a | 3 | NEW. The core business: furnished stays of 30+ days |
| 4008 | Rental Income — All-Inclusive | 2a | 3 | NEW. Utilities bundled into rent |
| 4010 | Late Fees | 2b | 3 | Other income related to the rental activity |
| 4030 | Parking Income | 2b | 3 | |
| 4040 | Utility Reimbursement | 2b | 3 | |
| 4050 | Application Fees | 2b | 3 | |
| 4060 | Laundry Income | 2b | 3 | |
| 4100 | Interest Income | — | — | 1065 page 1 / Schedule K portfolio income |
| 4110 | Forfeited Deposits | 2b | 3 | Income when forfeited, not when held (see 2010) |
| 4120 | Other Income | 2b | 3 | |
| 4070 | Management Income | **not 8825** | — | NEW. 1065 page 1 gross receipts |
| 4080 | Other Business Income | **not 8825** | — | NEW. Amazon KDP and similar |

### Mid-term, not short-term

Mid-term means an average stay of 30 days or more. That remains **passive rental income
reported on Form 8825 / Schedule E**, and it is **not** subject to self-employment tax.
The 7-day average-stay rule that pushes short-term rentals toward Schedule C and
non-passive treatment does not apply, and neither does the "short-term rental loophole."
That changes only if substantial services are provided (daily housekeeping, meals,
concierge) — which would move the activity to Schedule C / 1065 page 1 and bring SE tax
with it.

4005 and 4008 therefore exist to **evidence** average stay length and the
utilities-included structure, not to change the schedule. Average stay is proven from
`leases`, not from the account code.

## 4. Expense accounts

Ordered by Form 8825 line. "E" is the Schedule E line.

| Code | Name | 8825 | E | Note |
|---|---|---|---|---|
| 5000 | Advertising | 3 | 5 | |
| 5010 | Auto & Travel | 4 | 6 | Mileage log required |
| 5020 | Cleaning & Maintenance | 5 | 7 | Turnovers |
| 5030 | Commissions | 6 | 8 | |
| 5040 | Insurance | 7 | 9 | |
| 5300 | Mortgage Interest | 8 | 12 | Interest portion only — see §7 |
| 5310 | Other Interest | 8 | 13 | 8825 merges both into line 8 |
| 5050 | Legal & Professional Fees | 9 | 10 | Ordinary |
| 5055 | Litigation — Arias | 9 | 10 | NEW. Segregated for the recovery waterfall; still line 9 |
| 5090 | Property Taxes | 10 | 16 | |
| 5070 | Repairs | 11 | 14 | Repair, not improvement — see §8 |
| 5100 | Utilities — Electric | 12 | 17 | |
| 5110 | Utilities — Gas | 12 | 17 | |
| 5120 | Utilities — Water/Sewer | 12 | 17 | |
| 5130 | Utilities — Trash | 12 | 17 | |
| 5140 | Utilities — Internet/Cable | 12 | 17 | |
| 5015 | Contract Labor (1099) | **13** | 19 | NEW. No labor account exists today; 1099-NEC source |
| 5400–5430 | Depreciation (building, improvements, appliances, furniture) | 14 | 18 | Computed on Form 4562, not booked from bank data |
| 5060 | Management Fees | 17 | 11 | Paid to a manager |
| 5080 | Supplies | 17 | 15 | |
| 5025 | Furnishings & Décor | 17 | 19 | NEW. Below the capitalization threshold; above it see §8 |
| 5200 | HOA Dues | 17 | 19 | |
| 5210 | Condo Fees | 17 | 19 | |
| 5220 | Special Assessments | 17 | 19 | Often capital — see §8 |
| 5320 | Bank Charges | 17 | 19 | |
| 5330 | Credit Card Fees | 17 | 19 | |
| 6000 | Office Expenses | 17 | 19 | |
| 6010 | Software Subscriptions | 17 | 19 | |
| 6020 | Phone & Communication | 17 | 19 | |
| 6030 | Education & Training | 17 | 19 | |
| 6040 | Licenses & Permits | 17 | 19 | Includes registered-agent fees |
| 6050 | AI & Compute | 17 | 19 | NEW. Anthropic, OpenAI and similar — 71 suspense rows |

Every "17" row must be itemizable for Schedule A (Form 8825). That is why they stay
separate accounts rather than one "Other" bucket.

## 5. Flow of funds

The Mercury account structure already encodes how money moves. 39 accounts, named by
role, are effectively a ledger drawn in bank accounts. Reading them in order gives the
rule for what is a P&L event and what is merely a hop.

```
  tenant / guest
        │  external money in  ──────────────► RECOGNIZE revenue (4000/4005/4008)
        ▼
  [🤑 Rental Income]  per property: City 3372, Loft 5890, Cozy 2955, Mami 0744, Villa 4804
        │  sweep                              TRANSFER (1900) — no P&L
        ▼
  [👁️ Operating]      per property: City 5608, Loft 4232, Cozy 1039, Villa 3732, MGMT 0374
        │  fund a payable                     TRANSFER (1900) — no P&L
        ▼
  [💳 Payable]        Mortgage 1131, HOA 1751, Insurance 4828, Credit Card 7371,
        │             Astound 8349, Wireless 3310, AP 8208
        │  external money out ──────────────► RECOGNIZE expense (5000–6050)
        │                                     or reduce a liability (2040/2500)
        ▼
  vendor / servicer / card issuer

  surplus from Operating:
        ├─► [💸 Owner Distributions] City 7418, Loft 2144, Cozy 7238, Mami 0410,
        │     Villa 6811, JAV 8918   ──────►  EQUITY draw (3010) — never an expense
        ├─► [💰 Retained Earnings 8517] ───►  TRANSFER (1900), equity at period end (3020)
        └─► [👯 Clearing] CHIT 2062 intra, ARBI 1809 + CITY 9860 inter
                                      ──────►  TRANSFER (1900 / 1910)

  other inflows:
        [👹 Management Income 5343] ───────►  4070 — 1065 page 1, NOT Form 8825
        [💲 Fee Income 2624, 💵 Fee 8130] ─►  4010 / 4050 — 8825 line 2b
        [💰 Amazon KDP 0406] ─────────────►  4080 — 1065 page 1
        [🚫 Holding 2167 / 5381] ─────────►  1920 until the far side is known
        [🚫 Deposit Return 4993] ─────────►  2010 — held, not earned
        [📍 Arias Equity Adjustment 0830] ►  2520 / equity — attribution, not income
        [🚔 Uber Rides 3738] ─────────────►  5010 — 8825 line 4
```

**The rule this yields:** a movement is a P&L event only when the counterparty is
outside the group. Every hop between two accounts the group controls is a transfer,
whatever it is labelled. Revenue is recognized once, at the rental income account;
expense is recognized once, when money leaves for a vendor. Funding a payable account
before paying the vendor is not a second expense.

Two corollaries the current data violates:

- **Double recognition.** A scraped vendor statement (ComEd, Mr. Cooper) recorded as its
  own expense row, alongside the Mercury payment of the same bill, books the cost twice.
  Production already holds the bank side for these vendors — 22 Mr. Cooper payments in
  Mercury CSV alone. A statement is evidence for a bank row, not a second row. This is
  why PR #152 is on hold.
- **Sweeps as income.** A sweep from rental income to operating, or to a distribution
  account, is 1,220 of the suspense rows. Booked as income or expense it inflates both
  the 8825 top line and its expense lines.

Deposits deserve their own note: money received as a security deposit is a liability
(2010) from the day it arrives, not rental income, and becomes income (4110) only when
forfeited and applied. Mercury's dedicated deposit-return holding account (4993) is the
natural carrier for that distinction.

## 6. Balance-sheet and control accounts

These hit no income or expense line. Booking them to an income or expense line is the single largest error in
the current data.

### Clearing — the largest gap

| Code | Name | Type | Why |
|---|---|---|---|
| 1900 | Transfer Clearing — Intra-Entity | asset | NEW. Between two accounts of one entity. ~1,220 suspense rows, $470K |
| 1910 | Transfer Clearing — Intercompany | asset | NEW. Between entities. Mercury already runs clearing accounts (`CHIT 2062`, `ARBI 1809`, `CITY 9860`) |
| 1920 | Payment Rail Holding | asset | NEW. Venmo, Zelle, cash, "incoming"/"send" — 695 suspense rows — a rail, not a category |

`transactions.type` allows only `income` and `expense` today, so 1,631 transfer-like
rows are forced to be one or the other, overstating both sides of the P&L and of every
8825 line derived from them. Required, in order:

1. Add `transfer` to the `type` domain.
2. Record both legs, sharing a `metadata.transfer_group`.
3. Book each leg to 1900 or 1910.
4. Exclude `type='transfer'` from every report and from the 8825/Schedule E mapping.
5. Assert the clearing accounts net to zero per period. A non-zero balance means a
   missing leg — which is the point of a clearing account rather than dropping the rows.

### Liabilities and equity

| Code | Name | Type | Why |
|---|---|---|---|
| 2040 | Credit Card Payable | liability | Exists, unused. Amex, Citi, Huntington payments — 453 suspense rows. Paying a card is not an expense; the original purchase was |
| 2045 | Buy-Now-Pay-Later Payable | liability | NEW. Affirm, Afterpay — 193 suspense rows |
| 2500 | Mortgage Payable — Primary | liability | Principal portion of each payment — see §7 |
| 2530 | Owner Loan Payable | liability | Exists, unused. 135 "loan" rows, $47K |
| 2010 | Security Deposits Held | liability | Held, not earned. Becomes 4110 only on forfeiture |
| 3000 / 3010 | Owner Capital / Draws | equity | Member contributions and distributions; K-1, never an expense |

### Control

| Code | Name | Why |
|---|---|---|
| 9000 | Owner Personal Expense | Exists, unused. Spotify, Netflix, Apple, Temu — 322 suspense rows. Non-deductible, and a draw against 3010 if paid from a business account |
| 9010 | Suspense / Unclassified | Work queue. Excluded from every return line |
| 9020 | Ask My Accountant | Escalation, not a category |
| 9030 | Reconciliation Adjustments | Must be zero at year end |
| 9040 | Data Quality Hold | NEW. Source is broken: 113 REI Hub `"(inactive` payees, 6 rows dated 1970-01-01 |

## 7. Mortgage payments

A scraped or bank-fed mortgage payment is one amount covering three things, and only one
of them is deductible:

| Portion | Goes to | Line |
|---|---|---|
| Interest | 5300 | 8825 line 8 / E 12 |
| Principal | 2500 | none — balance sheet |
| Escrow: taxes | 5090 | 8825 line 10 / E 16 |
| Escrow: insurance | 5040 | 8825 line 7 / E 9 |

Never book a whole payment to 5300. Without a servicer statement giving the split, the
row goes to 9010 and waits. The annual Form 1098 is the authority.

## 8. Repair versus improvement

8825 line 11 (repairs) is deductible now; an improvement is capitalized and recovered
through depreciation on Form 4562 instead. The tangible property regulations draw the
line: a betterment, restoration, or adaptation to a new use is an improvement.

Capital additions belong in the 1500–1620 asset accounts, with depreciation expensed to
5400–5430. **The existing 7000-series "Capital Improvements" accounts are typed
`expense`, which is wrong** — a capital improvement is an asset addition. Either retype
them as assets or retire them in favour of the 1500-series. Flagged, not changed.

Safe-harbour elections (de minimis, small taxpayer, routine maintenance) are what keep
most furnishings and small repairs on line 11 or 17 rather than on Form 4562. Those
elections attach to the return; the chart records what was bought, not the election.

## 9. Dimensions

`property_id` and `unit_id` exist on `transactions` and are populated on **0 of 12,522
rows**. Form 8825 is reported **per property** (columns A–D, with page 2 for more), so
per-property attribution is not a management nicety — it is required to complete the
form. Today it cannot be produced from this data.

The upstream data exists: Mercury runs one account per property (City, Loft, Cozy,
Villa, Mami — each with operating, rental income and owner distribution accounts), and
REI Hub carries its own property field.

- **Property** → `property_id` / `unit_id` (8825 column A–D)
- **Entity** → `tenant_id` (which 1065 this lands on)
- **Account** → `coa_code` (which line)

A property must never become an account code.

## 10. Mercury: native categories, tags and GL codes

Mercury currently holds 60 custom categories that mix four different dimensions —
accounts (`expense-repairs`), entities (`it-can-be-llc`), properties (`citystudio`),
and status (`failed`) — with 11 drifted duplicate pairs (`villa-vista`/`villavista`,
`expense-late_fee`/`expense-late-fee`, `revenue-managementincome`/
`revenue-management-income`, and so on).

Mercury also exposes `glAllocations` with a `glCodeName`, and live data already contains
values like `6020 - Phone & Communication` — the ChittyFinance code and name exactly.
That field, not the category field, is the right carrier for an account.

**Target design:**

| Mercury feature | Carries | Format | Example |
|---|---|---|---|
| GL code (`glAllocations`) | the account, and only the account | `<code> - <name>` exactly as this document | `5070 - Repairs` |
| Custom category | one dimension, prefixed | `prop-*`, `entity-*`, `status-*` | `prop-citystudio` |
| Merchant category (`mercuryCategory`) | Mercury's own auto-tag | untouched | `Software` |
| Note | human context | free text | servicer statement reference |

**Categories to keep**, renamed to one prefixed dimension each:

- `prop-citystudio`, `prop-lakesideloft`, `prop-cozycastle`, `prop-villavista`,
  `prop-aptarlene`, `prop-moradamami`
- `entity-aribia`, `entity-itcanbe`, `entity-chitty`
- `status-failed` (replaces `failed` and `ignore-failed`), `status-needs-split`
  (replaces `revenue-mixed`), `status-shared` (replaces `expense-shared`, an allocation
  rule rather than an account)
- `channel-airbnb` and similar booking-source tags

**Categories to retire** once GL codes carry the account: every `expense-*`,
`revenue-*`, `liability-*`, `member-*`, `transfer-*` and `mortgage` category. Their
meaning moves to the GL code. Retire, don't delete, until historical rows are re-coded —
the mapping in §11 is what allows the history to be read either way.

**Why this way round:** a category is one free-text field per transaction, so encoding
four dimensions in it guarantees collisions and duplicates — which is exactly what the
current 60 categories show. GL codes are a separate field, already present, already
matching this chart.

## 11. Mercury → ChittyFinance mapping (existing categories)

Mapping contract for history. Not yet implemented in any importer.

| Mercury category | Account | Other dimension |
|---|---|---|
| `revenue-rental-income` | 4000 or 4005 by lease length | — |
| `revenue-furnished-rental` | 4005 | — |
| `revenue-all-inclusive-rental` | 4008 | — |
| `revenue-management-income`, `revenue-managementincome` | 4070 | duplicate pair; 1065 page 1 |
| `revenue-fees-application`, `revenue-application-fees` | 4050 | duplicate pair |
| `revenue-fees-parking`, `revenue-parking` | 4030 | duplicate pair |
| `revenue-fees-movein` | 4120 | — |
| `revenue-mixed` | 9010 | needs splitting by hand |
| `expense-repairs` | 5070 | — |
| `expense-cleaning` | 5020 | — |
| `expense-labor` | 5015 | 8825 line 13 |
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
| `expense-capital-improvement` | 1500-series asset | see §8 |
| `expense-discount-or-credit` | contra-revenue against the 4000 series | — |
| `mortgage`, `liability-mortgage` | split 2500 / 5300 / escrow | see §7 |
| `liability-credit_card_payment` | 2040 | — |
| `liability-deposits-damage`, `security-deposit-refund` | 2010 | — |
| `liability-arias`, `arias-liability` | 2520 | duplicate pair |
| `member-contribution` | 3000 | — |
| `member-distribution`, `distribution` | 3010 | duplicate pair |
| `transfer` | 1900 | `type='transfer'` |
| `transfer-intracompany` | 1900 | `type='transfer'` |
| `transfer-intercompany` | 1910 | `type='transfer'` |
| `refund` | contra against the original account | — |
| `failed`, `ignore-failed` | excluded | status |
| `citystudio`, `lakesideloft`, `cozycastle`, `villa-vista`, `villavista`, `aptarlene` | — | `property_id` |
| `it-can-be-llc`, `itcanbellc`, `chitty`, `airbnb` | — | `tenant_id` or channel |
| `expense-shared` | allocation rule | see `allocation_rules` |

## 12. Source health

| Source | Rows | Suspense | Note |
|---|---|---|---|
| reihub | 6,356 | 55% | Expenses positive; 113 `"(inactive` payees; 6 rows dated 1970-01-01 |
| hdpro | 1,901 | 22% | |
| amazon | 1,690 | 17% | Best-classified |
| mercury_csv | 1,589 | 61% | |
| mercury_webhook | 970 | 85% | The live feed is the worst-classified |

Signs: 10,407 rows positive, 2,113 negative. Mercury records expenses negative; REI Hub,
HD Pro and Amazon record them positive. Reports paper over this with `Math.abs`, which
holds only while nothing nets the two together.

## 13. What this document does not do

- No account created, renamed, retyped or retired in production — including the
  7000-series typing error in §8.
- No transaction reclassified.
- `type='transfer'` does not exist; §6 is a specification.
- `property_id` remains unpopulated; §9 is a specification.
- No Mercury category renamed or retired; §10 is a proposal.
- Nothing here is tax advice. The line mappings are prep work for a preparer to review;
  ARIBIA's 2024 filings are delinquent and under LITC review.
