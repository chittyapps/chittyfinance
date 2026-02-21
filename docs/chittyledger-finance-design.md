# ChittyLedger - Finance: Design Specification

> Document reconciliation vertical for ChittyLedger, consumed by ChittyFinance

## Overview

ChittyLedger provides core immutable ledger infrastructure: trust scoring, chain of custody, fact extraction, and contradiction detection. **ChittyLedger-Finance** is a vertical that maps these capabilities to financial document processing and transaction reconciliation.

ChittyFinance does **not** own document intake or parsing. It consumes structured financial signals from ChittyLedger-Finance and matches them against bank/accounting API data.

## Core Mapping

| ChittyLedger Core | Finance Vertical | Purpose |
|---|---|---|
| `masterEvidence` | `financial_documents` | Receipts, invoices, statements, payment confirmations |
| `atomicFacts` | `financial_facts` | Extracted amount, vendor, date, category, account ref |
| `evidenceTiers` | `financial_source_tiers` | Bank API (1.0) → email receipt (0.7) → manual (0.4) |
| `chainOfCustodyLog` | `financial_audit_log` | Who uploaded, processed, matched, modified |
| `contradictions` | `reconciliation_conflicts` | Amount mismatch, duplicate charge, missing receipt |

## Data Flow

```
  ChittyTrace                ChittyLedger-Finance           ChittyFinance
  ──────────                 ────────────────────           ─────────────

  Email ──┐
          ├─▶ Intake &  ───▶  Extract financial facts ───▶  Match to transactions
  Upload ─┘   classify        Score source trust            Flag conflicts
                              Store immutable record        Update reconciled status
                              Detect contradictions         Surface to dashboard
                              Emit signals
```

1. **ChittyTrace** ingests a document (email receipt, forwarded invoice, bank alert PDF)
2. **ChittyTrace** classifies it as financial and routes to ChittyLedger-Finance
3. **ChittyLedger-Finance** extracts financial facts via AI workers:
   - Amount(s), vendor/payee, date, reference numbers
   - Assigns confidence score per fact
   - Assigns source trust tier based on origin
4. **ChittyLedger-Finance** stores document + facts in immutable ledger
5. **ChittyLedger-Finance** emits a reconciliation signal (queue or webhook)
6. **ChittyFinance** receives the signal and attempts to match:
   - Amount + date + vendor match → auto-reconcile
   - Partial match → surface for review
   - No match → flag as unmatched document
   - Contradiction → flag conflict (e.g., receipt says $450, bank says $500)

## Financial Source Trust Tiers

Extends ChittyLedger's 8-tier trust system for financial sources:

| Tier | Score | Source | Example |
|------|-------|--------|---------|
| 1 | 1.00 | Bank API (direct) | Mercury API transaction feed |
| 2 | 0.95 | Accounting API (direct) | Wave / QuickBooks API sync |
| 3 | 0.90 | Official statement PDF | Downloaded from bank portal |
| 4 | 0.85 | Payment processor | Stripe webhook event |
| 5 | 0.70 | Email receipt (verified) | `receipt@vendor.com` with DKIM |
| 6 | 0.60 | Email receipt (unverified) | Forwarded receipt, no DKIM |
| 7 | 0.50 | Scanned document | Photo of paper receipt |
| 8 | 0.40 | Manual entry | User-typed transaction |

---

## Schema

All tables live in the **ChittyLedger** database, extending its core schema.

### `financial_documents`

Financial evidence registry. Extends `masterEvidence`.

```sql
CREATE TABLE financial_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  source_type     TEXT NOT NULL,           -- email_receipt, invoice, bank_statement,
                                           -- payment_confirmation, tax_form, contract
  source_trust_tier INTEGER NOT NULL,      -- 1-8
  trust_score     DECIMAL(3,2) NOT NULL,   -- 0.40-1.00

  -- Document
  title           TEXT NOT NULL,
  file_key        TEXT,                    -- R2 object key
  file_type       TEXT,                    -- pdf, eml, csv, png, xlsx
  file_hash       TEXT,                    -- SHA-256

  -- Origin
  origin_service  TEXT NOT NULL,           -- chittytrace, chittyfinance, manual_upload
  origin_ref      TEXT,                    -- Source document ID
  ingested_by     TEXT,                    -- Worker/service ID

  -- Processing
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending, processing, extracted, verified, failed
  facts_extracted INTEGER DEFAULT 0,

  -- Immutability
  ledger_hash     TEXT,                    -- Hash chain for tamper detection
  previous_hash   TEXT,                    -- Prior entry link

  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX financial_documents_tenant_idx ON financial_documents(tenant_id);
CREATE INDEX financial_documents_status_idx ON financial_documents(status);
CREATE INDEX financial_documents_origin_idx ON financial_documents(origin_service, origin_ref);
```

### `financial_facts`

Atomic financial claims extracted from documents. Extends `atomicFacts`.

```sql
CREATE TABLE financial_facts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id       UUID NOT NULL REFERENCES financial_documents(id),
  tenant_id         UUID NOT NULL,

  -- Extracted fact
  fact_type         TEXT NOT NULL,           -- amount, vendor, date, account_ref,
                                             -- invoice_number, tax_amount, line_item,
                                             -- payment_method, category
  fact_value        TEXT NOT NULL,            -- Raw extracted value
  fact_normalized   JSONB,                   -- Typed: {"amount": 450.00, "currency": "USD"}

  -- Confidence
  confidence        DECIMAL(3,2) NOT NULL,   -- 0.00-1.00
  extraction_method TEXT NOT NULL,            -- ai_gpt4o, ai_claude, ocr, structured_parse, manual

  -- Verification
  verified          BOOLEAN DEFAULT false,
  verified_by       TEXT,                    -- User ID or auto_matched
  verified_at       TIMESTAMPTZ,

  metadata          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX financial_facts_document_idx ON financial_facts(document_id);
CREATE INDEX financial_facts_tenant_idx ON financial_facts(tenant_id);
CREATE INDEX financial_facts_type_idx ON financial_facts(fact_type);
```

### `transaction_links`

Bridge between ChittyLedger facts and ChittyFinance transactions.

```sql
CREATE TABLE transaction_links (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ChittyLedger side
  document_id      UUID NOT NULL REFERENCES financial_documents(id),
  fact_ids         UUID[] NOT NULL,

  -- ChittyFinance side
  tenant_id        UUID NOT NULL,
  transaction_id   UUID NOT NULL,           -- ChittyFinance transactions.id
  account_id       UUID,                    -- ChittyFinance accounts.id

  -- Match quality
  match_type       TEXT NOT NULL,           -- exact, partial, manual, suggested
  match_confidence DECIMAL(3,2) NOT NULL,   -- 0.00-1.00
  match_method     TEXT NOT NULL,           -- auto_amount_date_vendor, auto_ref_number,
                                            -- fuzzy_vendor, manual_user, ai_suggested

  -- Status
  status           TEXT NOT NULL DEFAULT 'pending',  -- pending, confirmed, rejected, superseded
  confirmed_by     TEXT,
  confirmed_at     TIMESTAMPTZ,

  metadata         JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX transaction_links_document_idx ON transaction_links(document_id);
CREATE INDEX transaction_links_transaction_idx ON transaction_links(transaction_id);
CREATE INDEX transaction_links_tenant_idx ON transaction_links(tenant_id);
```

### `reconciliation_conflicts`

Contradictions between documents and transactions. Extends `contradictions`.

```sql
CREATE TABLE reconciliation_conflicts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,

  -- Conflict
  conflict_type   TEXT NOT NULL,            -- amount_mismatch, duplicate_charge,
                                            -- missing_receipt, missing_transaction,
                                            -- date_discrepancy, vendor_mismatch
  severity        TEXT NOT NULL,            -- critical, high, medium, low

  -- References
  document_id     UUID REFERENCES financial_documents(id),
  transaction_id  UUID,                     -- ChittyFinance transactions.id
  link_id         UUID REFERENCES transaction_links(id),

  -- Details
  expected_value  TEXT,                     -- What the document says
  actual_value    TEXT,                     -- What the transaction says
  difference      DECIMAL(12,2),            -- For amount mismatches
  description     TEXT NOT NULL,

  -- Resolution
  status          TEXT NOT NULL DEFAULT 'open',  -- open, investigating, resolved, dismissed
  resolution      TEXT,                     -- corrected_transaction, corrected_document,
                                            -- accepted_difference, duplicate_removed
  resolved_by     TEXT,
  resolved_at     TIMESTAMPTZ,

  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX reconciliation_conflicts_tenant_idx ON reconciliation_conflicts(tenant_id);
CREATE INDEX reconciliation_conflicts_status_idx ON reconciliation_conflicts(status);
CREATE INDEX reconciliation_conflicts_severity_idx ON reconciliation_conflicts(severity);
```

### `financial_audit_log`

Immutable chain of custody. Extends `chainOfCustodyLog`.

```sql
CREATE TABLE financial_audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   UUID NOT NULL REFERENCES financial_documents(id),
  tenant_id     UUID NOT NULL,

  action        TEXT NOT NULL,              -- ingested, facts_extracted, matched,
                                            -- conflict_detected, reconciled,
                                            -- manually_verified, exported
  performed_by  TEXT NOT NULL,              -- User ID, service name, or worker ID

  -- Integrity
  hash_before   TEXT,
  hash_after    TEXT,

  details       JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX financial_audit_log_document_idx ON financial_audit_log(document_id);
CREATE INDEX financial_audit_log_tenant_idx ON financial_audit_log(tenant_id);
CREATE INDEX financial_audit_log_action_idx ON financial_audit_log(action);
```

---

## Reconciliation Signals

Events emitted by ChittyLedger-Finance for downstream services. Delivered via Cloudflare Queues (production) or webhook POST (development).

```typescript
interface ReconciliationSignal {
  id: string;
  type:
    | 'document.ingested'
    | 'facts.extracted'
    | 'match.found'
    | 'match.suggested'
    | 'conflict.detected'
    | 'conflict.resolved'
    | 'document.unmatched';

  tenantId: string;
  timestamp: string;             // ISO 8601

  payload: {
    documentId: string;
    documentType: string;
    trustScore: number;

    facts?: {
      amount?: { value: number; currency: string; confidence: number };
      vendor?: { value: string; confidence: number };
      date?: { value: string; confidence: number };
      reference?: { value: string; confidence: number };
    };

    match?: {
      transactionId: string;
      confidence: number;
      method: string;
    };

    conflict?: {
      type: string;
      severity: string;
      expected: string;
      actual: string;
    };
  };
}
```

---

## ChittyFinance Integration

### Schema Additions

```typescript
// New columns on existing transactions table (system.schema.ts)
reconciliationSource: text('reconciliation_source'),  // ChittyLedger document_id
reconciliationScore: decimal('reconciliation_score', { precision: 3, scale: 2 }),
reconciledAt: timestamp('reconciled_at'),

// New table: inbound signal log
export const reconciliationSignals = pgTable('reconciliation_signals', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  signalId: text('signal_id').notNull().unique(),
  signalType: text('signal_type').notNull(),
  documentId: text('document_id').notNull(),
  transactionId: uuid('transaction_id').references(() => transactions.id),
  payload: jsonb('payload'),
  status: text('status').notNull().default('pending'),
  processedAt: timestamp('processed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  tenantIdx: index('recon_signals_tenant_idx').on(table.tenantId),
  signalIdx: index('recon_signals_signal_idx').on(table.signalId),
  statusIdx: index('recon_signals_status_idx').on(table.status),
}));
```

### API Endpoints

```
POST /api/reconciliation/signals       Receive signals from ChittyLedger-Finance
GET  /api/reconciliation/pending       List unmatched documents
GET  /api/reconciliation/conflicts     List active conflicts
POST /api/reconciliation/confirm       Manually confirm a suggested match
POST /api/reconciliation/dismiss       Dismiss a conflict
GET  /api/transactions/:id/documents   View linked source documents
```

---

## Infrastructure

### R2 Storage

Shared bucket between ChittyLedger-Finance (write) and ChittyFinance (read):

```
chittyos-financial-documents (R2)
└── {tenant_id}/
    ├── receipts/{document_id}.pdf
    ├── invoices/{document_id}.pdf
    ├── statements/{document_id}.pdf
    └── exports/{document_id}.csv
```

### Signal Delivery

| Method | Latency | Recommendation |
|--------|---------|----------------|
| Cloudflare Queues | Low | Production |
| Service binding | Lowest | Same CF account |
| Webhook POST | Medium | Development / cross-service |
| Polling API | High | Fallback only |

---

## Open Questions

1. Should ChittyLedger-Finance share a database with ChittyLedger core or use its own?
2. Does ChittyTrace push to ChittyLedger-Finance directly or through ChittyRouter?
3. Shared R2 bucket vs. ChittyFinance copying documents it needs?
4. Canonical tenant ID format across services -- UUID from ChittyFinance or ChittyID DID?
