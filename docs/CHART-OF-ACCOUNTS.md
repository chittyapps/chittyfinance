# Chart of Accounts

Definition of the ChittyFinance chart of accounts, oriented to the IRS lines each
account is reported on, plus the dimensions beside it and the Mercury-native
categories and GL codes that feed it.

Status: **authoritative**. This document defines the chart of accounts. Where it and
any other artifact disagree, this document wins and the other is the defect.

- `database/chart-of-accounts.ts` is its machine-readable projection and must match it.
  `server/__tests__/chart-of-accounts-doc-parity.test.ts` fails CI if they diverge.
- That file seeds `chart_of_accounts` in the database (`database/seeds/chart-of-accounts.ts`).
- Importers may only emit codes defined here, validated through `getAccountByCode()`.
- Change this document first, then the projection, then the database. Never the reverse.

**Applied state:** the 95 accounts registered in §14 are defined in the projection. The 15
marked NEW below (and `*` in §14) are not yet in the production table (80 accounts there,
verified identical to the pre-change projection on 2026-09-17); seeding them is a separate
approved step, and it would also rename 4000 to `Rental Income - Long-Term`. No
transaction has been reclassified and no Mercury setting has been changed.

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
| 4000 | Rental Income - Long-Term | 2a | 3 | Unfurnished, year-length leases |
| 4005 | Rental Income — Mid-Term Furnished | 2a | 3 | NEW. The core business: furnished stays of 30+ days |
| 4008 | Rental Income — All-Inclusive | 2a | 3 | NEW. Utilities bundled into rent |
| 4010 | Late Fees | 2b | 3 | Other income related to the rental activity |
| 4020 | Pet Fees | 2b | 3 | Non-refundable pet rent and fees |
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
| 5400 | Depreciation - Building | 14 | 18 | Computed on Form 4562, not booked from bank data |
| 5410 | Depreciation - Improvements | 14 | 18 | |
| 5420 | Depreciation - Appliances | 14 | 18 | |
| 5430 | Depreciation - Furniture | 14 | 18 | |
| 5060 | Management Fees | 17 | 11 | Paid to a manager |
| 5080 | Supplies | 17 | 15 | |
| 5025 | Furnishings & Decor | 17 | 19 | NEW. Below the capitalization threshold; above it see §8 |
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
  tenant / guest (TurboTenant ACH)
        │  external money in ───────────────► RECOGNIZE revenue (4000/4005/4008)
        ▼                                     attribute property HERE — it is the
  [🤑 Rental Income]  per property:           only point where property is unambiguous
  City 3372, Loft 5890, Cozy 2955, Mami 0744, Villa 4804
        │  100% auto-sweep, seconds later     TRANSFER (1900) — no P&L
        ▼
  [🚫 MGMT 5381 Holding]  ← every property's cash lands in ONE pooled account
        │
        ├─► [👁️ Operating 0374] ───────────►  TRANSFER (1900), funds card spend
        ├─► [💳 Payable accounts] ─────────►  TRANSFER (1900), then the bill is paid:
        │     Mortgage 1131, HOA 1751,        RECOGNIZE expense (5000–6050) or
        │     Insurance 4828, Card 7371,      reduce a liability (2040 / 2500)
        │     Astound 8349, Wireless 3310,
        │     AP 8208
        └─► [💸 Owner Distributions] ──────►  EQUITY draw (3010) — never an expense
              City 7418, Loft 2144, Cozy 7238, Mami 0410, Villa 6811, JAV 8918

  other inflows:
        [👹 Management Income 5343] ───────►  4070 — 1065 page 1, NOT Form 8825
        [💲 Fee 2624, 💵 Fee 8130] ────────►  4010 / 4050 — 8825 line 2b
        [💰 Amazon KDP 0406] ─────────────►  4080 — 1065 page 1
        [🚫 Other 2167, Deposit 4993] ────►  1920 / 2010
        [📍 Arias Equity Adjustment 0830] ►  2520 / equity — attribution, not income
        [🚔 Uber 3738] ───────────────────►  5010 — 8825 line 4
        [💰 Retained Earnings 8517] ──────►  TRANSFER (1900); equity at period end (3020)
        [👯 Clearing 2062 / 1809 / 9860] ─►  TRANSFER (1900 / 1910)
```

### Mercury auto-transfer rules (observed 2026-09-17)

Mercury's API exposes no rule configuration — no endpoint returns targets, percentages
or schedules. The only trace is `bankDescription` on the resulting transaction. The
rules below are therefore **inferred from transaction evidence**, and the dashboard is
the only place they can be confirmed or changed.

| Movement | Trigger | Shape | Evidence |
|---|---|---|---|
| 🤑 Rental Income → 🚫 Holding 5381 | each rent deposit | **100% sweep**, same amount, seconds later | `bankDescription: "Percentage-based rule auto-transfer"` |
| 🚫 Holding 5381 → 👁️ Operating 0374 | after card spend | variable top-up | plain "Transfer between your Mercury accounts" — rule vs manual **unverified** |
| 🚫 Holding 5381 → 💳 payable accounts | at bill time | top-up, then drawn to ~0 by the payment | same; **unverified** whether automated |

Worked example (Villa, 2026-09-15): TurboTenant posted $597.43 into Villa Rental Income
at 12:34:54; a percentage-rule auto-transfer moved exactly $597.43 to Holding 5381 at
12:35:21. Where a tenant pays rent plus fees, TurboTenant posts **several separate
deposits** (one per component) and each is swept 1:1 — Mercury is not splitting one
deposit across accounts.

**Identifying a transfer.** `kind === "internalTransfer"` is definitive. Both legs carry
identical `postedAt` to the microsecond and opposite `amount`, and each names the other
account in `counterpartyNickname` — which is populated *only* for internal movements.
The two legs have different ids, so pair on (amount, postedAt, counterparty), not id.
External activity uses `debitCardTransaction`, `outgoingPayment` or `other`, carries a
real vendor `counterpartyName`, and never sets `counterpartyNickname`.

Importer rule: `kind === 'internalTransfer'` → `type='transfer'`, book to 1900/1910,
exclude from P&L. Everything else is real income or expense.

### Mercury account structure: review and proposal

The 39 accounts are a ledger drawn in bank accounts, which is a genuine strength — the
structure is legible and each account states its job. Four problems are worth fixing.

**1. The 100% sweep destroys property attribution (most important).** Per-property
rental income accounts exist, then every property's cash is immediately pooled into one
shared holding account. Form 8825 is reported **per property**, so the structure
attributes revenue correctly for about 30 seconds and then commingles it. Every bill
paid downstream comes from pooled cash and cannot be attributed back.
*Proposal:* point each property's auto-transfer rule at that property's **own** operating
account rather than the shared holding account, and keep central treasury movements as
explicit transfers from there. Failing that, the importer must carry `property_id` from
the deposit through the sweep — which works only because the sweep is currently 1:1.

**2. Security deposits are not segregated.** There is a "Deposit Return Holding" account
but no per-entity deposit trust account. Chicago's RLTO requires tenant security
deposits to be held in a separate, non-commingled account, with interest paid, and the
penalties are punitive. *Proposal:* a dedicated deposit trust account per entity, never
swept, mapped to 2010, reconciled to the sum of active lease deposits.

**3. No reserves.** Nothing sets aside cash for property taxes, insurance renewals or
capital repairs; the chart has 1020 Cash — Reserve Fund with no bank account behind it.
*Proposal:* a tax/insurance reserve and a capital reserve, funded by rule from the same
sweep, mapped to 1020.

**4. Entity boundaries: intra-entity and inter-entity are different things, and today's
structure conflates them.** All 39 accounts sit under one legal entity, **ARIBIA LLC -
MGMT**, while three accounts are named for transfers to ARIBIA LLC, City Studio and IT
CAN BE LLC. Under the current structure those are *intra-entity* movements wearing
inter-entity labels. That today's accounts are arranged this way is not a reason to keep
it — the arrangement should follow the legal structure, not the other way round.

The distinction is not cosmetic:

| | Intra-entity | Inter-entity |
|---|---|---|
| What it is | Moving one entity's own money between its accounts | One entity paying or lending to another |
| Books | One set | Two — a mirrored pair |
| Account | 1900 Transfer Clearing | 1130 Due from Affiliate / 2540 Due to Affiliate, and 1910 while in flight |
| Nets to zero | Within the entity | Only when **both** entities' books are combined |
| Needs paperwork | No | Yes — management agreement, loan note, or it reads as a distribution |
| Tax effect | None | Real: 1065 per entity, K-1s, possible imputed interest, and a partner-level basis question |

**Target structure:**

1. **One Mercury organization per legal entity.** Each entity with its own EIN files its
   own 1065 and needs its own books and its own bank relationship. Accounts belonging to
   ARIBIA LLC, City Studio and IT CAN BE LLC should not live inside the MGMT
   organization.
2. **Within an entity**, property and function sub-accounts as today (income, operating,
   payables, reserves) with movements booked to 1900 and excluded from P&L.
3. **Between entities**, real payments, each with a stated basis: a management fee (4070
   income to the manager, 5060 expense to the owner), a reimbursement, a loan (1130/2540
   with a note and a rate), or a capital contribution/distribution (3000/3010). The
   clearing account 1910 holds the movement only while in flight; the standing balance
   belongs in 1130/2540 and must agree, sign-flipped, with the counterparty entity's
   books.
4. **Reconcile the pair.** Due from Affiliate on one side must equal Due to Affiliate on
   the other at every period end. That check is the entire reason to separate 1910 from
   1130/2540, and it is impossible while both entities share one organization.

This matters beyond bookkeeping. Entity separation is what the Arias litigation and the
ARIBIA → JonesCo transition both turn on, and commingled accounts are the standard
argument against it. Confirm the legal structure with the LITC/CPA before rearranging
banking, then let the account structure follow it.

**Also worth doing:** three holding accounts (Other 2167, MGMT 5381, Deposit 4993) do
overlapping work — keep one for in-flight money (1920), one for the deposit trust
(2010), and retire the third. Most accounts sit permanently at $0 because they are
routing labels rather than stores of value, which is fine, but it means balances cannot
be used as a health check; the clearing-nets-to-zero assertion in §6 replaces that.

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
| 1130 | Due from Affiliate | asset | NEW. Standing inter-entity receivable; must mirror the other entity's 2540 |
| 2540 | Due to Affiliate | liability | NEW. Standing inter-entity payable; must mirror the other entity's 1130 |

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

Mercury also exposes `glAllocations` with a `glCodeName`. **That field is not
authoritative and must not be imported as an account.** The values are a QuickBooks
default template, not this chart, and the live assignments are wrong:

| Transaction | Mercury `glCodeName` | Correct account |
|---|---|---|
| Netflix | `Cost of goods sold` | 9000 Owner Personal |
| Astound Broadband | `Cost of goods sold` | 5140 Utilities — Internet |
| Jewel-Osco | `Cost of goods sold:Direct supplies & materials` | 5080 Supplies |
| Tello Mobile | `Office Supplies & Software` | 6020 Phone & Communication |
| PCs for People | `Contributions to charities` | 5070 / 6000 by use |

A rental partnership has no cost of goods sold, and none of these are charitable
contributions. Coverage is also partial — GL codes appear on a minority of recent card
transactions and on none from 2024.

**Target design:**

| Mercury feature | Carries | Format | Example |
|---|---|---|---|
| Custom category | one dimension, prefixed | `prop-*`, `entity-*`, `status-*`, `channel-*` | `prop-citystudio` |
| GL code (`glAllocations`) | the account — only if the QuickBooks template is replaced with this chart's codes | `<code> - <name>` | `5070 - Repairs` |
| Merchant category (`mercuryCategory`) | Mercury's own auto-tag | untouched, advisory | `Software` |
| Note | human context | free text | servicer statement reference |

Two ways forward on GL codes, in preference order:

1. **Replace** Mercury's GL list with the codes in this document, then treat
   `glAllocations` as an L1 suggestion (never authoritative — it is still typed by hand).
2. **Ignore** `glAllocations` entirely on import and classify from payee, amount and
   category. This is the default until the list is replaced, because importing the
   current values would book personal streaming and internet service to cost of goods
   sold.

Either way, a Mercury GL code is evidence, not a classification: it feeds
`suggested_coa_code` at L1 and a human or rule promotes it.

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
  7000-series typing error in §8. The 4000 rename and the 15 new accounts exist only in
  the projection until the seed step is run.
- No transaction reclassified.
- `type='transfer'` does not exist; §6 is a specification.
- `property_id` remains unpopulated; §9 is a specification.
- No Mercury category renamed or retired; §10 is a proposal.
- Nothing here is tax advice. The line mappings are prep work for a preparer to review;
  ARIBIA's 2024 filings are delinquent and under LITC review.

## 14. Complete account register

Every account this document defines. The narrative tables above explain the ones that
carry a decision; this one is the whole chart, and it is **normative for the name, type
and treatment strings** — the projection must reproduce them character for character.
Where §3–§8 spell a name with a typographic dash, the register's form is the name.

`*` marks the 15 accounts added by this document and not yet seeded to production.
Treatment is defined in §1 and §6: `pl` reaches a return line, `balance` is balance-sheet
only, `transfer` is an internal movement, `control` is a work queue or a non-deductible
holding. `8825` and `Sch E` give the line on Form 8825 and on Schedule E Part I; `—`
means the account reaches neither (a balance-sheet or control account, or — for 4070,
4080 and 4100 — income reported on Form 1065 page 1 instead).

| Code | Name | Type | Treatment | 8825 | Sch E |
|---|---|---|---|---|---|
| 1000 | Cash - Operating | asset | balance | — | — |
| 1010 | Cash - Security Deposits | asset | balance | — | — |
| 1020 | Cash - Reserve Fund | asset | balance | — | — |
| 1050 | Petty Cash | asset | balance | — | — |
| 1100 | Accounts Receivable - Rent | asset | balance | — | — |
| 1110 | Accounts Receivable - Other | asset | balance | — | — |
| 1130 * | Due from Affiliate | asset | balance | — | — |
| 1500 | Land | asset | balance | — | — |
| 1510 | Buildings | asset | balance | — | — |
| 1515 | Accumulated Depreciation - Buildings | asset | balance | — | — |
| 1520 | Land Improvements | asset | balance | — | — |
| 1525 | Accumulated Depreciation - Improvements | asset | balance | — | — |
| 1600 | Appliances | asset | balance | — | — |
| 1605 | Accumulated Depreciation - Appliances | asset | balance | — | — |
| 1610 | Furniture & Fixtures | asset | balance | — | — |
| 1615 | Accumulated Depreciation - Furniture | asset | balance | — | — |
| 1620 | HVAC Equipment | asset | balance | — | — |
| 1625 | Accumulated Depreciation - HVAC | asset | balance | — | — |
| 1900 * | Transfer Clearing - Intra-Entity | asset | transfer | — | — |
| 1910 * | Transfer Clearing - Intercompany | asset | transfer | — | — |
| 1920 * | Payment Rail Holding | asset | transfer | — | — |
| 2000 | Accounts Payable | liability | balance | — | — |
| 2010 | Security Deposits Held | liability | balance | — | — |
| 2020 | Prepaid Rent | liability | balance | — | — |
| 2030 | Accrued Expenses | liability | balance | — | — |
| 2040 | Credit Card Payable | liability | balance | — | — |
| 2045 * | Buy-Now-Pay-Later Payable | liability | balance | — | — |
| 2500 | Mortgage Payable - Primary | liability | balance | — | — |
| 2510 | Mortgage Payable - Secondary | liability | balance | — | — |
| 2520 | Notes Payable | liability | balance | — | — |
| 2530 | Owner Loan Payable | liability | balance | — | — |
| 2540 * | Due to Affiliate | liability | balance | — | — |
| 3000 | Owner Capital | equity | balance | — | — |
| 3010 | Owner Draws | equity | balance | — | — |
| 3020 | Retained Earnings | equity | balance | — | — |
| 3030 | Current Year Earnings | equity | balance | — | — |
| 4000 | Rental Income - Long-Term | income | pl | 2a | 3 |
| 4005 * | Rental Income - Mid-Term Furnished | income | pl | 2a | 3 |
| 4008 * | Rental Income - All-Inclusive | income | pl | 2a | 3 |
| 4010 | Late Fees | income | pl | 2b | 3 |
| 4020 | Pet Fees | income | pl | 2b | 3 |
| 4030 | Parking Income | income | pl | 2b | 3 |
| 4040 | Utility Reimbursement | income | pl | 2b | 3 |
| 4050 | Application Fees | income | pl | 2b | 3 |
| 4060 | Laundry Income | income | pl | 2b | 3 |
| 4070 * | Management Income | income | pl | — | — |
| 4080 * | Other Business Income | income | pl | — | — |
| 4100 | Interest Income | income | pl | — | — |
| 4110 | Forfeited Deposits | income | pl | 2b | 3 |
| 4120 | Other Income | income | pl | 2b | 3 |
| 5000 | Advertising | expense | pl | 3 | 5 |
| 5010 | Auto & Travel | expense | pl | 4 | 6 |
| 5015 * | Contract Labor (1099) | expense | pl | 13 | 19 |
| 5020 | Cleaning & Maintenance | expense | pl | 5 | 7 |
| 5025 * | Furnishings & Decor | expense | pl | 17 | 19 |
| 5030 | Commissions | expense | pl | 6 | 7 |
| 5040 | Insurance | expense | pl | 7 | 9 |
| 5050 | Legal & Professional Fees | expense | pl | 9 | 10 |
| 5055 * | Litigation - Arias | expense | pl | 9 | 10 |
| 5060 | Management Fees | expense | pl | 17 | 11 |
| 5070 | Repairs | expense | pl | 11 | 14 |
| 5080 | Supplies | expense | pl | 17 | 15 |
| 5090 | Property Taxes | expense | pl | 10 | 16 |
| 5100 | Utilities - Electric | expense | pl | 12 | 17 |
| 5110 | Utilities - Gas | expense | pl | 12 | 17 |
| 5120 | Utilities - Water/Sewer | expense | pl | 12 | 17 |
| 5130 | Utilities - Trash | expense | pl | 12 | 17 |
| 5140 | Utilities - Internet/Cable | expense | pl | 12 | 17 |
| 5200 | HOA Dues | expense | pl | 17 | 19 |
| 5210 | Condo Fees | expense | pl | 17 | 19 |
| 5220 | Special Assessments | expense | pl | 17 | 19 |
| 5300 | Mortgage Interest | expense | pl | 8 | 12 |
| 5310 | Other Interest | expense | pl | 8 | 13 |
| 5320 | Bank Charges | expense | pl | 17 | 19 |
| 5330 | Credit Card Fees | expense | pl | 17 | 19 |
| 5400 | Depreciation - Building | expense | pl | 14 | 18 |
| 5410 | Depreciation - Improvements | expense | pl | 14 | 18 |
| 5420 | Depreciation - Appliances | expense | pl | 14 | 18 |
| 5430 | Depreciation - Furniture | expense | pl | 14 | 18 |
| 6000 | Office Expenses | expense | pl | 17 | 19 |
| 6010 | Software Subscriptions | expense | pl | 17 | 19 |
| 6020 | Phone & Communication | expense | pl | 17 | 19 |
| 6030 | Education & Training | expense | pl | 17 | 19 |
| 6040 | Licenses & Permits | expense | pl | 17 | 19 |
| 6050 * | AI & Compute | expense | pl | 17 | 19 |
| 7000 | Capital Improvements - Building | expense | balance | — | — |
| 7010 | Capital Improvements - HVAC | expense | balance | — | — |
| 7020 | Capital Improvements - Roof | expense | balance | — | — |
| 7030 | Capital Improvements - Appliances | expense | balance | — | — |
| 7040 | Capital Improvements - Other | expense | balance | — | — |
| 9000 | Owner Personal Expense | expense | control | — | — |
| 9010 | Suspense / Unclassified | expense | control | — | — |
| 9020 | Ask My Accountant | expense | control | — | — |
| 9030 | Reconciliation Adjustments | expense | control | — | — |
| 9040 * | Data Quality Hold | expense | control | — | — |
