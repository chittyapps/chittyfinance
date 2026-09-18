# Chart of Accounts

Definition of the ChittyFinance chart of accounts, oriented to the IRS lines each
account is reported on, plus the dimensions beside it and the Mercury-native
categories and GL codes that feed it.

Status: **authoritative**. This document defines the chart of accounts. Where it and
any other artifact disagree, this document wins and the other is the defect.

- `database/chart-of-accounts.ts` is its machine-readable projection and must match it.
  `server/__tests__/chart-of-accounts-doc-parity.test.ts` fails CI if they diverge.
- The seed that carries the projection into the `chart_of_accounts` table
  (`database/seeds/chart-of-accounts.ts`) runs, and is a **dry run by default**: it prints
  the insert/update/unchanged delta against the global rows (`tenant_id IS NULL`) and
  writes nothing without `--apply` (`pnpm db:seed:coa` dry-runs; `pnpm db:seed:coa -- --apply`
  writes). Running it against production is an operator-approved step and has not been done.
  Measured against the Neon dev branch on 2026-09-18 it is 15 inserts and 70 updates, of
  which 6 change a name, description or Schedule E line and 64 only backfill the
  `parent_code` and keyword `metadata` the seed derives and the existing rows never carried. The table has no Form 8825 column — only `schedule_e_line` —
  so the `form8825` line this document assigns is resolved at read time through
  `getForm8825Line()` rather than persisted. See §13.
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

1. **Every *reportable* account maps to an IRS line.** The chart exists to produce a
   return. An account whose §14 treatment is `pl` and that maps to no line on Form 8825,
   Schedule E, Form 1065 page 1 or Form 4562 should not exist. Where several accounts
   share one line (utilities, admin), the split exists for management reporting and nets
   back to that line.

   The invariant is scoped to `pl` deliberately, because the `balance`, `transfer` and
   `control` accounts of §6 reach no income-tax line *by design* and an unscoped rule
   would forbid the very control accounts this document adds. Where the others land:
   assets, liabilities and equity are balance-sheet items belonging to Schedule L and the
   capital-account analysis, not to an 8825 or Schedule E line; clearing accounts
   (1900/1910/1920) hold money in flight and must net to zero before a return is prepared
   (§6); control accounts (9000–9040) are work queues and non-deductible holdings that
   must be emptied into real accounts, never reported. ARIBIA may not file Schedule L at
   all — Form 1065 Schedule B question 4 excuses Schedules L, M-1 and M-2 (and item F,
   and item L on each K-1) when total receipts are under $250,000, total assets under
   $1 million, the K-1s are filed and furnished on time, and no Schedule M-3 is required.
   Whether ARIBIA answers "Yes" is the preparer's call; either way none of these accounts
   reaches an 8825 or Schedule E line.
2. **One dimension per field.** An account code says *what kind of money movement* this
   is. It never encodes which property, which entity, or what state a row is in. Property
   is `property_id` / `unit_id`, state is the classification fields, and `tenant_id` is
   the **data scope** — *not* the legal entity, which has no field today (§9).
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
attaches to **Form 1065**, flows to **Schedule K line 2** (net rental real estate income)
and reaches each member as **Schedule K-1 box 2**.

> ### Read the "Sch E" column as Part I — and Part I is not ARIBIA's destination
>
> Every Schedule E line in this document is a **Part I** line, and a partnership's rental
> activity never reaches Part I. The partnership path is: Form 8825 → Form 1065
> Schedule K line 2 → Schedule K-1 box 2 → the partner's **Schedule E Part II**, headed
> *Income or Loss From Partnerships and S Corporations*: "If you are a member of a
> partnership or joint venture or a shareholder in an S corporation, use Part II to
> report your share of the partnership or S corporation income (even if not received) or
> loss" (2025 Instructions for Schedule E).
>
> The Part I column stays, because it is load-bearing twice over. It is the
> **directly-held-property equivalent** of each account — what a member who owns a
> property outside the partnership actually files — and it is what the projection's
> `scheduleE` field means (`database/chart-of-accounts.ts`). Read a cell as "if this cost
> were incurred on a directly held property, it would be Schedule E Part I line N", never
> as "ARIBIA reports this on Schedule E Part I line N".

Line numbers verified 2026-09-17 against IRS sources: Form 8825 (Rev. December 2025)
and the 2025 Schedule E (Form 1040).

The two forms do not have the same lines, which drives several decisions below:

| | Form 8825 | Schedule E Part I (direct holding) |
|---|---|---|
| W-2 wages | **line 13** Wages and salaries | no line — goes to Other (19) |
| Contract labor (1099-NEC) | no line — Other (17) | no line — Other (19) |
| Supplies | no line — Other (17) | **line 15** Supplies |
| Management fees | no line — Other (17) | **line 11** Management fees |
| Interest | one line (8) | split: mortgage (12), other (13) |
| Taxes | line 10 Real estate taxes | line 16 Taxes |
| Other | line 17 — Schedule A (Form 8825) only if M-3 | line 19, list |

Form 8825 lines 15 and 16 are reserved for future use. **Schedule A (Form 8825) is
conditional on a Schedule M-3 filing requirement, not universal**, even though the face
of the form prints "attach Schedule A (Form 8825)" flatly. The instructions are the
operative rule — 2025 Instructions for Form 8825 and Schedule A, *Line 17 — Other
Deductions*: "For partnerships and S corporations that don't have a Schedule M-3 filing
requirement, enter all other deductions for each property listed. All others, see
Schedule A next." And earlier: "If you're a partnership or S corporation that is required
to file Schedule M-3, you must use new Schedule A (Form 8825), Rental Real Estate Other
Deductions, to report other deductions and include the total amount on Form 8825,
line 17." Column (c) of line 1 is M-3-only for the same reason.

A partnership files Schedule M-3 only if total assets at year end are $10 million or
more, adjusted total assets are $10 million or more, total receipts are $35 million or
more, or a reportable entity partner owns 50% or more of capital, profit or loss
(2025 Instructions for Form 1065, *Item J*). **ARIBIA is orders of magnitude under every
threshold, so it enters a single "other deductions" figure per property on line 17 and
attaches no Schedule A.** Why the 5200/5320/6000-series accounts stay separate anyway is
answered at the end of §4.

**Not rental income — and not one destination.** Neither management fees earned from
managing for others (4070) nor book royalties (4080) are rental real estate, so neither
belongs on Form 8825. They do not share a destination either. Management income is
service revenue in the ordinary course of a management business: **Form 1065 page 1
gross receipts**, carrying self-employment exposure for members that rental income does
not. Royalties are portfolio income on **Schedule K line 7** unless they arise in the
ordinary course of a licensing business — the test is in §3. Keeping the two in separate
accounts is what makes the two destinations separable at filing time.

## 3. Income accounts

| Code | Name | 8825 | Sch E I (direct) | Note |
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
| 4100 | Interest Income | — | — | Portfolio interest — Schedule K line 5. Rule below |
| 4110 | Forfeited Deposits | 2b | 3 | Income when forfeited, not when held (see 2010) |
| 4120 | Other Income | 2b | 3 | |
| 4070 | Management Income | **not 8825** | — | NEW. 1065 page 1 gross receipts |
| 4080 | Other Business Income | **not 8825** | — | NEW. Amazon KDP royalties — Schedule K line 7. Test below |

### 4100 Interest Income is portfolio income, not page 1

An earlier note sent 4100 to "1065 page 1". That is wrong on the ordinary path. Interest
is **portfolio income reported on Schedule K line 5** — "Enter only taxable portfolio
interest on this line" (2025 Instructions for Form 1065, *Line 5. Interest Income*) —
reaching the partner in **Schedule K-1 box 5**. It is neither page 1 gross receipts nor
Form 8825 income.

The rule for 4100, applied at classification time:

1. **Interest from a lending business?** Portfolio income is "all gross income, other
   than income derived in the ordinary course of a trade or business, that is
   attributable to interest; dividends; royalties; …", and the instructions name as
   ordinary-course (therefore *not* portfolio) "Interest income on loans and investments
   made in the ordinary course of a trade or business of lending money." ARIBIA does not
   lend money as a business.
2. **Interest on trade receivables?** Also ordinary-course: "Interest on accounts
   receivable arising from the performance of services or the sale of property in the
   ordinary course of a trade or business of performing such services or selling such
   property, but only if credit is customarily offered to customers of the business."
   Tenant late charges are not this — they are late fees on rent, and they already book to
   4010 (Form 8825 line 2b), not to 4100.
3. **Otherwise** — bank and treasury interest, which is all ARIBIA has — it is portfolio
   interest: **Schedule K line 5, K-1 box 5**, and no 8825 or Schedule E line.

If a lending or seller-financing activity ever arises it does not belong in 4100; it
needs its own account so the two destinations stay separable at filing time.

### 4080 Other Business Income: royalties are Schedule K line 7

Amazon KDP pays **royalties**, and royalties are portfolio income by default: "Generally,
portfolio income includes all gross income, other than income derived in the ordinary
course of a trade or business, that is attributable to interest; dividends; royalties; …"
(2025 Instructions for Form 1065, *Portfolio Income*). The destination is therefore
**Schedule K line 7, Royalties** — "Enter the royalties received by the partnership" —
reaching the partner in **Schedule K-1 box 7**. Not page 1 gross receipts.

The single exception the instructions name is ordinary-course licensing: "Royalties
derived by the taxpayer in the ordinary course of a trade or business of licensing
intangible property." The test, applied **per stream**:

- Is publishing or licensing a trade or business of the entity — regular, continuous,
  carried on for profit — rather than a passive stream from work already published? If
  yes, the receipts are ordinary business income on **Form 1065 page 1, line 1a**, the
  related costs are page-1 deductions, and self-employment exposure has to be considered.
- If no — the ordinary case for a book royalty — it is **Schedule K line 7**.

ARIBIA's KDP receipts are a passive stream from published titles, so 4080 is Schedule K
line 7 today. Because the answer can differ per stream and can change year to year, 4080
carries no fixed 8825 or Schedule E line in §14 and the destination is decided at filing
time from this test, never inferred from the account code. A stream that becomes an
ordinary-course licensing business needs its own account rather than a re-reading of
4080.

### Mid-term, not short-term

Mid-term means an average stay of 30 days or more. Two different rules get collapsed into
one here, and only the second decides self-employment tax.

1. **Is it a rental activity? (§469 / Reg. §1.469-1T(e)(3))** An average stay of 7 days or
   less — or 30 days or less where significant personal services are provided — takes the
   activity outside the definition of a *rental activity*. That governs the
   passive-activity analysis and whether material participation can make a loss
   non-passive. It is not an SE-tax rule, and failing it does not by itself move the
   income to Schedule C.
2. **Is it subject to SE tax? (§1402(a)(1) / Reg. §1.1402(a)-4(c))** Rentals from real
   estate are excluded from net earnings from self-employment *unless* services are
   rendered to the occupant beyond those customarily supplied with the space. That is a
   services test, not a stay-length test.

At a 30+ day average stay with no substantial services, the activity is a rental activity
under (1) and outside SE tax under (2), so it is reported on **Form 8825 / Schedule E**.
Furnishings, bundled utilities and cleaning between stays are customary and do not change
that. Daily housekeeping, meals or concierge service would be substantial services — which
can both take the activity out of rental treatment under (1) and bring SE tax under (2),
moving the revenue to Schedule C / 1065 page 1.

4005 and 4008 therefore exist to **evidence** average stay length and the
utilities-included structure, not to change the schedule. Average stay is proven from
`leases`, not from the account code.

## 4. Expense accounts

Ordered by Form 8825 line. "E I" is the Schedule E **Part I** line for a directly held
property — not ARIBIA's destination as a partnership; see §2.

| Code | Name | 8825 | E I (direct) | Note |
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
| 5400 | Depreciation - Building | 14 | 18 | Computed on Form 4562, not booked from bank data |
| 5410 | Depreciation - Improvements | 14 | 18 | |
| 5420 | Depreciation - Appliances | 14 | 18 | |
| 5430 | Depreciation - Furniture | 14 | 18 | |
| 5060 | Management Fees | 17 | 11 | Paid to a manager |
| 5080 | Supplies | 17 | 15 | |
| 5015 | Contract Labor (1099) | 17 | 19 | NEW. 1099-NEC non-employee labor — not wages, so not line 13 |
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

Line 17 is one figure per property for a non-M-3 filer like ARIBIA, so no Schedule A is
attached today (§2). The "17" rows stay separate accounts anyway, on three grounds that
do not depend on Schedule A: the composition of that single figure still has to be
substantiable on examination; crossing an M-3 threshold later must not require re-coding
history to produce Schedule A; and Schedule E Part I splits several of them onto
different lines — management fees to 11, supplies to 15, the rest to 19 — so the split is
required for the directly-held case regardless.

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
        [💰 Amazon KDP 0406] ─────────────►  4080 — Sch K line 7, NOT Form 8825
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
5. Assert the 1900 and 1910 clearing accounts net to zero per period. A non-zero balance
   means a missing leg — which is the point of a clearing account rather than dropping
   the rows. 1920 is outside the assertion; see the sign convention below.

### Sign convention for transfer legs

`transactions.amount` is **signed, in the sign its source gave it**. Nothing normalizes it
at ingest, and **`Math.abs` must never be applied to a clearing leg** — absolute value
makes a matched pair sum to twice the amount instead of to zero, destroying the only
check the clearing accounts exist to perform.

Both legs of a Mercury internal transfer are real rows: they share `postedAt` to the
microsecond and carry **opposite** amounts (Mercury writes the outflow negative and the
inflow positive). `server/books/transfers.ts` on `feat/transfer-semantics` (PR #160)
implements exactly this, and this section documents what that module does rather than a
rule invented beside it:

- **Direction is derived, never stored twice.** `transfer_direction` is
  `amount >= 0 ? 'in' : 'out'`.
- **Both legs compute the same group key independently**, without looking up the sibling
  (which may not have arrived when the webhook fires): `metadata.transfer_group` is a
  hash of (`|amount|` to two decimals, `postedAt` verbatim). The magnitude is absolute
  only inside that key — never in the arithmetic. A leg with no usable `postedAt` is
  still a transfer, booked to clearing with no group, and surfaces as an ungrouped leg.
- **Per group:** `round2(Σ amount over the group) === 0` **and** the leg count is even.
  Failing either makes it an unmatched group — a missing leg, not a row to drop.
- **Per tenant and period:** `round2(Σ amount over rows where type = 'transfer' and the
  effective clearing code is 1900 or 1910) === 0`. "Effective" means
  `coa_code ?? suggested_coa_code`, because ingest is trust level L1 and writes only the
  suggestion — reading `coa_code` alone would find no rows and report a balanced empty
  set.
- **An empty period does not pass.** `balanced` additionally requires at least one leg, so
  a period with no transfers reports `balanced: false, legCount: 0` rather than passing
  vacuously.

Rounding is to cents: `decimal(12,2)` amounts arrive as strings and float addition
otherwise leaves residue that reads as an imbalance.

**Why 1920 is excluded.** Payment Rail Holding carries a Venmo, Zelle or cash movement
while the far side is still unknown, so its counterparty may well be outside the group and
it has no sibling leg to net against. Step 5 asserts 1900 and 1910 only. PR #160's
`TRANSFER_CLEARING_CODES` accordingly lists those two, while the constant of the same name
in `database/chart-of-accounts.ts` lists all three — it answers a different question,
namely which accounts carry `transfer` treatment in §14. The two lists are not expected to
be equal.

**Mixed source signs do not threaten this today.** `kind === 'internalTransfer'` exists
only on Mercury rows, so the REI Hub, HD Pro and Amazon rows that record expenses positive
(§12) never reach the transfer path. A future importer that books transfers from a
positive-expense source must write its two legs with opposing signs rather than carrying
the source convention through.

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

- **Property** → `property_id` / `unit_id` (Form 8825 column A–D)
- **Data scope** → `tenant_id` — the ChittyFinance workspace a row belongs to. **Not the
  legal entity.** See below.
- **Legal entity** → *no field exists.* Which 1065 a row lands on is not derivable today.
- **Booking channel** → *no field exists.* Airbnb, TurboTenant, direct.
- **Account** → `coa_code` (which line)

A property must never become an account code.

### `tenant_id` is a data scope, not a legal entity

An earlier draft read "Entity → `tenant_id` (which 1065 this lands on)". That is wrong and
would put rows on the wrong return. `tenant_id` is the multi-tenant partition key; it is
derived at import from property and bank-account mappings (`server/books/import.ts`), and
the seeded values cut across legal entities:

| Property | tenant slug | What that tenant is |
|---|---|---|
| Lakeside Loft (541 W Addison) | `nicholas-bianchi` | a personal workspace |
| Cozy Castle (550 W Surf C504) | `nicholas-bianchi` | the same personal workspace |
| City Studio (550 W Surf C211) | `aribia-city-studio` | a per-property workspace |

Two properties share one personal workspace while a third has a workspace of its own, so
`tenant_id` is one-to-one with neither a legal entity nor a property. It cannot answer
"which 1065", and a report that reads it as the entity will consolidate the wrong things.

What is needed, and does not exist:

1. A **legal-entity mapping** — a first-class `entity_id` on `transactions`, or a
   property → entity table — populated from the deed and the operating agreement, not
   from a bank-account nickname. That is what selects the 1065, and §5's target structure
   (one Mercury organization per legal entity) is the banking half of the same change.
2. A **booking-channel field**. §11 previously routed the Mercury category `airbnb` to
   "`tenant_id` or channel". It is neither: Airbnb is where a booking came from,
   orthogonal to both the entity that owns the property and the workspace the row lives
   in. Until the field exists, `airbnb` is carried in metadata and assigned to no
   dimension.

Until (1) exists, the entity for a row is resolved by hand at filing time from the
property. §13 records this as a specification, not shipped behaviour.

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
| Custom category | **the property, and nothing else** | `prop-*` | `prop-citystudio` |
| GL code (`glAllocations`) | the account — only if the QuickBooks template is replaced with this chart's codes | `<code> - <name>` | `5070 - Repairs` |
| Merchant category (`mercuryCategory`) | Mercury's own auto-tag | untouched, advisory | `Software` |
| Note | human context | free text | servicer statement reference |

**Why the custom category carries property and only property.** Mercury's transaction
update contract accepts a **single `categoryId`** — one custom category per transaction,
with no multi-valued custom field. `glAllocations[]` is not a second dimension either: it
is a list of (GL code, amount) allocations *of the same transaction*, so it carries the
account and the split, not property, entity, status or channel.

Four prefixed dimensions therefore cannot ride in Mercury at once. A transaction tagged
`prop-citystudio` cannot also carry `entity-aribia`, `status-failed` and
`channel-airbnb`. An earlier draft of this section listed all four as if they could
coexist; they cannot, and tagging any of the other three silently costs the property.

**The dimension chosen is property**, because it is the only one that is *otherwise
unrecoverable*. Form 8825 is organized by property (columns A–D), and the 100% sweep
described in §5 destroys the attribution within seconds of the deposit landing — the
Mercury tag is applied at the one moment the property is unambiguous. The other three are
derivable at ingest from data ChittyFinance already holds or will hold:

| Dimension | Where it lives instead | Derived at ingest from |
|---|---|---|
| Property | **Mercury custom category**, `prop-*` | the deposit account, while it is still unambiguous |
| Legal entity | `entity_id` — to be added, see §9 | property → entity, from the deed and the operating agreement |
| Status | the classification fields (confidence, review queue, exclusion flag) | the classifier; a failed payment is a transaction state, not a category |
| Booking channel | a channel field — to be added, see §9 | payer and description: TurboTenant, Airbnb, direct |

A lossless composite encoding (`prop-citystudio|entity-aribia|status-ok` in one category
string) was considered and rejected. It multiplies the category list combinatorially —
precisely the failure that produced today's 60 categories and 11 drifted duplicate pairs —
and every consumer would have to parse a delimiter out of a free-text field that nothing
validates. One field, one dimension, and the dimension kept is the one that cannot be
reconstructed later.

Two ways forward on GL codes, in preference order:

1. **Replace** Mercury's GL list with the codes in this document, then treat
   `glAllocations` as an L1 suggestion (never authoritative — it is still typed by hand).
2. **Ignore** `glAllocations` entirely on import and classify from payee, amount and
   category. This is the default until the list is replaced, because importing the
   current values would book personal streaming and internet service to cost of goods
   sold.

Either way, a Mercury GL code is evidence, not a classification: it feeds
`suggested_coa_code` at L1 and a human or rule promotes it.

**Categories to keep** — the property, and nothing else:

- `prop-citystudio`, `prop-lakesideloft`, `prop-cozycastle`, `prop-villavista`,
  `prop-aptarlene`, `prop-moradamami`

**Categories retained only until the matching ChittyFinance field exists**, per the table
above: `entity-aribia`, `entity-itcanbe`, `entity-chitty`; `status-failed` (replaces
`failed` and `ignore-failed`), `status-needs-split` (replaces `revenue-mixed`),
`status-shared` (replaces `expense-shared`, an allocation rule rather than an account);
`channel-airbnb` and similar booking-source tags. Because Mercury holds one category per
transaction, a row carrying any of these is by definition *not* carrying its property, so
each is a stopgap marker on rows the classifier cannot otherwise resolve — never a
parallel tagging scheme.

**Categories to retire** once GL codes carry the account: every `expense-*`,
`revenue-*`, `liability-*`, `member-*`, `transfer-*` and `mortgage` category. Their
meaning moves to the GL code. Retire, don't delete, until historical rows are re-coded —
the mapping in §11 is what allows the history to be read either way.

**Why this way round:** a category is one free-text field per transaction, so encoding
four dimensions in it guarantees collisions and duplicates — which is exactly what the
current 60 categories show. GL codes are a separate field, already present, already
matching this chart.

## 11. Mercury → ChittyFinance mapping (existing categories)

Mapping contract for history. Not yet implemented in any importer. Every row resolves to
accounts declared in §14; where a category maps to more than one, the Account cell names
the closed output set and a rule (R1–R6) below names the input that selects within it.

| Mercury category | Account | Other dimension |
|---|---|---|
| `revenue-rental-income` | 4000, 4005 — rule R1 | — |
| `revenue-furnished-rental` | 4005 | — |
| `revenue-all-inclusive-rental` | 4008 | — |
| `revenue-management-income`, `revenue-managementincome` | 4070 | duplicate pair; 1065 page 1 |
| `revenue-fees-application`, `revenue-application-fees` | 4050 | duplicate pair |
| `revenue-fees-parking`, `revenue-parking` | 4030 | duplicate pair |
| `revenue-fees-movein` | 4120 | — |
| `revenue-mixed` | 9010 | needs splitting by hand |
| `expense-repairs` | 5070 | — |
| `expense-cleaning` | 5020 | — |
| `expense-labor` | 5015 | 8825 line 17 (Other), not line 13 |
| `expense-supplies` | 5080 | — |
| `expense-furnishings_decor` | 5025 | — |
| `expense-insurance` | 5040 | — |
| `expense-legal` | 5050 | — |
| `expense-LITIGATION-RELATED` | 5055 | — |
| `expense-utilities` | 5100, 5110, 5120, 5130, 5140 — rule R2 | — |
| `expense-connectivity` | 5140 | — |
| `expense-hoa`, `expense-association_dues`, `expense-association-dues` | 5200 | duplicate triple |
| `expense-late_fee`, `expense-late-fee` | 5320 | duplicate pair; a vendor/card late fee is a finance charge, not loan interest |
| `expense-software` | 6010 | — |
| `expense-marketing` | 5000 | — |
| `expense-travel` | 5010 | — |
| `expense-petty-cash` | 1050 | asset, not expense |
| `expense-capital-improvement` | 1500, 1510, 1520, 1600, 1610, 1620 — rule R3 | see §8 |
| `expense-discount-or-credit` | 4000, 4005, 4008 — rule R4, contra-revenue | — |
| `mortgage`, `liability-mortgage` | 2500, 5300, 5090, 5040 — rule R5 | see §7 |
| `liability-credit_card_payment` | 2040 | — |
| `liability-deposits-damage`, `security-deposit-refund` | 2010 | — |
| `liability-arias`, `arias-liability` | 2520 | duplicate pair |
| `member-contribution` | 3000 | — |
| `member-distribution`, `distribution` | 3010 | duplicate pair |
| `transfer` | 1900 | `type='transfer'` |
| `transfer-intracompany` | 1900 | `type='transfer'` |
| `transfer-intercompany` | 1910 | `type='transfer'` |
| `refund` | the original row's account — rule R6 | — |
| `failed`, `ignore-failed` | excluded | status |
| `citystudio`, `lakesideloft`, `cozycastle`, `villa-vista`, `villavista`, `aptarlene` | — | `property_id` |
| `it-can-be-llc`, `itcanbellc`, `chitty` | — | `tenant_id` (data scope, not the legal entity — see §9) |
| `airbnb` | — | booking channel; no field exists yet (see §9) |
| `expense-shared` | allocation rule | see `allocation_rules` |

### Resolution rules

Each rule names the **input** that selects among candidates and a **closed output set**.
No rule may return a code outside its set, and none may return nothing: the fallback is
always 9010 at low confidence (§1, principle 4).

**R1 — `revenue-rental-income` → one of {4000, 4005}.** Input: the lease behind the
deposit, matched on property and date. A term of twelve months or more, unfurnished →
**4000**. A term of thirty days up to twelve months, furnished → **4005**. No matching
lease → **9010**. Average stay is proven from `leases`, never from the account code (§3);
4008 is not reachable from this category, because `revenue-all-inclusive-rental` maps to
it directly.

**R2 — `expense-utilities` → one of {5100, 5110, 5120, 5130, 5140}.** Input: the payee on
the row, matched against a utility registry. Electric → **5100**. Gas → **5110**.
Water and sewer → **5120**. Trash and scavenger → **5130**. Internet, cable or line
service → **5140**, which the category `expense-connectivity` already reaches directly.
Payee not in the registry, or one invoice covering several utilities → **9010**; a
multi-utility invoice is split by hand and never assigned to whichever utility is largest.

**R3 — `expense-capital-improvement` → one of {1500, 1510, 1520, 1600, 1610, 1620}.**
Input: the asset class of the thing bought, once §8 has established it is an improvement
rather than a repair. Land → **1500**. Building structure and building systems → **1510**.
Site work, fencing, landscaping → **1520**. Appliances → **1600**. Furniture and fixtures
above the capitalization threshold → **1610**; below it this is not a capital improvement
at all and belongs in 5025. HVAC → **1620**. Class unclear → **9010**. Depreciation is
expensed separately to the 5400 series and is never booked from this category.

**R4 — `expense-discount-or-credit` → one of {4000, 4005, 4008}.** A concession is
contra-revenue, not an expense: a negative amount posted against the same income account
the discounted rent was recognized in, which R1 already selected for that lease. It never
creates an expense row and never nets against another property's income. Original income
account unidentifiable → **9010**.

**R5 — `mortgage`, `liability-mortgage` → a set of rows drawn from {2500, 5300, 5090,
5040}, or {9010}.** Input: a servicer statement or Form 1098 giving the split (§7). This
is the one rule whose output is several rows rather than one: principal → **2500**,
interest → **5300**, escrowed property tax → **5090**, escrowed insurance → **5040**.
Without the split the whole payment goes to **9010** and waits. A whole payment is never
booked to 5300.

**R6 — `refund` → whatever single account the original charge carries.** Input: the linked
original transaction, or a matched payee-and-amount pair within ninety days. The refund is
a negative amount in that same account, so the output set is that row's account and
nothing else. No original found → **9010**. A refund is never booked to 4120.

## 12. Source health

| Source | Rows | Suspense | Note |
|---|---|---|---|
| reihub | 6,356 | 55% | Expenses positive; 113 `"(inactive` payees; 6 rows dated 1970-01-01 |
| hdpro | 1,901 | 22% | |
| amazon | 1,690 | 17% | Best-classified |
| mercury_csv | 1,589 | 61% | |
| mercury_webhook | 970 | 85% | The live feed is the worst-classified |
| *(none)* | 16 | — | `metadata.source` is null — rows that predate source stamping |
| **Total** | **12,522** | | Agrees with the header count |

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
- There is no legal-entity field and no booking-channel field. `tenant_id` is a data
  scope, not the entity (§9); the entity for a row is resolved by hand at filing time.
- The sign convention in §6 documents `server/books/transfers.ts` on PR #160, which is not
  merged. Nothing on this branch enforces it.
- No Mercury category renamed or retired; §10 is a proposal.
- Nothing is seeded. The seed path itself is repaired and runnable, but it has not been
  run against production: `database/seeds/chart-of-accounts.ts` is a dry run unless given
  `--apply`, and applying it is a separate operator-approved step. Until then no account
  defined here has reached the `chart_of_accounts` table.
- The Form 8825 line is not persisted. `chart_of_accounts` carries `schedule_e_line` and
  no 8825 column, so `form8825` lives in this document and in the projection and is
  resolved at read time by `getForm8825Line()`. Adding a `form_8825_line` column stays
  available if a report ever needs to group by 8825 line in SQL.
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
holding. `8825` and `Sch E` give the line on Form 8825 and on Schedule E **Part I**. Part I is the
**directly-held-property equivalent**, not ARIBIA's destination: as a partnership its
rental activity runs Form 8825 → Form 1065 Schedule K line 2 → Schedule K-1 box 2 → the
partner's **Schedule E Part II** (§2). The Part I column is what a member filing a
directly held property would use, and it is what the projection's `scheduleE` field means.

`—` means the account reaches neither form — a balance-sheet, clearing or control account
(§6), or non-rental income routed elsewhere: 4070 Management Income to Form 1065 page 1
gross receipts, 4080 Other Business Income to Schedule K line 7 (royalties), and 4100
Interest Income to Schedule K line 5 (portfolio interest). See §3.

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
| 5015 * | Contract Labor (1099) | expense | pl | 17 | 19 |
| 5020 | Cleaning & Maintenance | expense | pl | 5 | 7 |
| 5025 * | Furnishings & Decor | expense | pl | 17 | 19 |
| 5030 | Commissions | expense | pl | 6 | 8 |
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
