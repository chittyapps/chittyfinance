# ChittyLedger-Finance: Design Specification

> Integration design for ChittyLedger's financial vertical and how ChittyFinance consumes it

## Concept

ChittyLedger provides core immutable ledger infrastructure (trust scoring, chain of custody, fact extraction, contradiction detection). **ChittyLedger-Finance** is a vertical that maps these capabilities to financial document processing and transaction reconciliation.

ChittyFinance does **not** own document intake or parsing. It consumes structured financial signals from ChittyLedger-Finance for reconciliation against its bank/accounting API data.

## Core Mapping: ChittyLedger → Finance Vertical

| ChittyLedger Core | Finance Vertical | Purpose |
|---|---|---|
| `masterEvidence` | `financial_documents` | Receipts, invoices, statements, payment confirmations |
| `atomicFacts` | `financial_facts` | Extracted: amount, vendor, date, category, account ref |
| `evidenceTiers` | `financial_source_tiers` | Bank API (1.0) > statement PDF (0.9) > email receipt (0.7) > manual (0.4) |
| `chainOfCustodyLog` | `financial_audit_log` | Who uploaded, processed, matched, modified |
| `contradictions` | `reconciliation_conflicts` | Amount mismatch, duplicate charge, missing receipt |

## Data Flow

```
                ChittyTrace                  ChittyLedger-Finance             ChittyFinance
                ───────────                  ────────────────────             ─────────────
  Email ───┐
           ├──▶ Intake &    ──────▶  Extract financial facts  ──────▶  Match to transactions
  Upload ──┘    classify              Score source trust                Flag conflicts
                                      Store immutable record            Update reconciled status
                                      Detect contradictions             Surface to dashboard
                                      Emit signals
```

### Step-by-step

1. **ChittyTrace** ingests document (email receipt, forwarded invoice, bank alert PDF)
2. **ChittyTrace** classifies as financial → routes to ChittyLedger-Finance
3. **ChittyLedger-Finance** extracts financial facts via AI workers:
   - Amount(s), vendor/payee, date, reference numbers
   - Assigns confidence score per fact
   - Assigns source trust tier based on origin
4. **ChittyLedger-Finance** stores document + facts in immutable ledger
5. **ChittyLedger-Finance** emits reconciliation signal (webhook or queue)
6. **ChittyFinance** receives signal, attempts to match against existing transactions:
   - Match by amount + date + vendor → auto-reconcile
   - Partial match → surface for review
   - No match → flag as unmatched document
   - Contradiction → flag conflict (e.g., receipt says $450, bank says $500)

## Financial Source Trust Tiers

Extending ChittyLedger's 8-tier system for financial sources:

| Tier | Trust Score | Financial Source | Example |
|------|-------------|-----------------|---------|
| 1 | 1.0 | Bank API (direct) | Mercury API transaction feed |
| 2 | 0.95 | Accounting API (direct) | Wave/QuickBooks API sync |
| 3 | 0.9 | Official bank statement PDF | Downloaded from bank portal |
| 4 | 0.85 | Payment processor | Stripe webhook event |
| 5 | 0.7 | Email receipt (verified sender) | receipt@vendor.com with DKIM |
| 6 | 0.6 | Email receipt (unverified) | Forwarded receipt, no DKIM |
| 7 | 0.5 | Scanned document | Photo of paper receipt |
| 8 | 0.4 | Manual entry | User-typed transaction |

## Schema: ChittyLedger-Finance Tables

These tables live in the **ChittyLedger** database, extending its core schema.

### `financial_documents`

The financial evidence registry. Extends `masterEvidence` patterns.

```sql
CREATE TABLE financial_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,                    -- ChittyOS tenant scope
  source_type TEXT NOT NULL,                  -- 'email_receipt', 'invoice', 'bank_statement',
                                              -- 'payment_confirmation', 'tax_form', 'contract'
  source_trust_tier INTEGER NOT NULL,         -- 1-8 (see trust tiers above)
  trust_score DECIMAL(3,2) NOT NULL,          -- 0.40 - 1.00

  -- Document metadata
  title TEXT NOT NULL,
  file_key TEXT,                              -- R2 object key (shared bucket or ChittyTrace bucket)
  file_type TEXT,                             -- 'pdf', 'eml', 'csv', 'png', 'xlsx'
  file_hash TEXT,                             -- SHA-256 for integrity verification

  -- Origin tracking
  origin_service TEXT NOT NULL,               -- 'chittytrace', 'chittyfinance', 'manual_upload'
  origin_ref TEXT,                            -- ChittyTrace document ID or external ref
  ingested_by TEXT,                           -- Worker/service that processed it

  -- Processing status
  status TEXT NOT NULL DEFAULT 'pending',     -- 'pending', 'processing', 'extracted', 'verified', 'failed'
  facts_extracted INTEGER DEFAULT 0,

  -- Immutability
  ledger_hash TEXT,                           -- Hash chain for tamper detection
  previous_hash TEXT,                         -- Links to prior entry

  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `financial_facts`

Atomic financial claims extracted from documents. Extends `atomicFacts` patterns.

```sql
CREATE TABLE financial_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES financial_documents(id),
  tenant_id UUID NOT NULL,

  -- The extracted fact
  fact_type TEXT NOT NULL,                    -- 'amount', 'vendor', 'date', 'account_ref',
                                              -- 'invoice_number', 'tax_amount', 'line_item',
                                              -- 'payment_method', 'category'
  fact_value TEXT NOT NULL,                   -- The extracted value (string representation)
  fact_normalized JSONB,                      -- Typed/normalized: {"amount": 450.00, "currency": "USD"}

  -- Confidence
  confidence DECIMAL(3,2) NOT NULL,           -- 0.00 - 1.00 (AI extraction confidence)
  extraction_method TEXT NOT NULL,            -- 'ai_gpt4o', 'ai_claude', 'ocr', 'structured_parse', 'manual'

  -- Verification
  verified BOOLEAN DEFAULT false,
  verified_by TEXT,                           -- User ID or 'auto_matched'
  verified_at TIMESTAMPTZ,

  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `transaction_links`

Bridge between financial facts and ChittyFinance transactions.

```sql
CREATE TABLE transaction_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ChittyLedger side
  document_id UUID NOT NULL REFERENCES financial_documents(id),
  fact_ids UUID[] NOT NULL,                   -- Array of financial_fact IDs used for matching

  -- ChittyFinance side
  tenant_id UUID NOT NULL,
  transaction_id UUID NOT NULL,               -- ChittyFinance transactions.id
  account_id UUID,                            -- ChittyFinance accounts.id

  -- Match quality
  match_type TEXT NOT NULL,                   -- 'exact', 'partial', 'manual', 'suggested'
  match_confidence DECIMAL(3,2) NOT NULL,     -- 0.00 - 1.00
  match_method TEXT NOT NULL,                 -- 'auto_amount_date_vendor', 'auto_ref_number',
                                              -- 'fuzzy_vendor', 'manual_user', 'ai_suggested'

  -- Status
  status TEXT NOT NULL DEFAULT 'pending',     -- 'pending', 'confirmed', 'rejected', 'superseded'
  confirmed_by TEXT,                          -- User ID who confirmed
  confirmed_at TIMESTAMPTZ,

  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `reconciliation_conflicts`

Detected contradictions between documents and transactions.

```sql
CREATE TABLE reconciliation_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,

  -- What conflicts
  conflict_type TEXT NOT NULL,                -- 'amount_mismatch', 'duplicate_charge',
                                              -- 'missing_receipt', 'missing_transaction',
                                              -- 'date_discrepancy', 'vendor_mismatch',
                                              -- 'category_mismatch'
  severity TEXT NOT NULL,                     -- 'critical', 'high', 'medium', 'low'

  -- References
  document_id UUID REFERENCES financial_documents(id),
  transaction_id UUID,                        -- ChittyFinance transactions.id
  link_id UUID REFERENCES transaction_links(id),

  -- Conflict details
  expected_value TEXT,                        -- What the document says
  actual_value TEXT,                          -- What the transaction says
  difference DECIMAL(12,2),                   -- For amount mismatches
  description TEXT NOT NULL,

  -- Resolution
  status TEXT NOT NULL DEFAULT 'open',        -- 'open', 'investigating', 'resolved', 'dismissed'
  resolution TEXT,                            -- 'corrected_transaction', 'corrected_document',
                                              -- 'accepted_difference', 'duplicate_removed'
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,

  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `financial_audit_log`

Immutable chain of custody for financial documents. Extends `chainOfCustodyLog`.

```sql
CREATE TABLE financial_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES financial_documents(id),
  tenant_id UUID NOT NULL,

  action TEXT NOT NULL,                       -- 'ingested', 'facts_extracted', 'matched',
                                              -- 'conflict_detected', 'reconciled',
                                              -- 'manually_verified', 'exported'
  performed_by TEXT NOT NULL,                 -- User ID, service name, or worker ID

  -- Integrity
  hash_before TEXT,
  hash_after TEXT,

  details JSONB,                              -- Action-specific context
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Reconciliation Signal Schema

Events emitted by ChittyLedger-Finance for downstream consumption.
These can be delivered via Cloudflare Queues, webhooks, or polled via API.

```typescript
interface ReconciliationSignal {
  id: string;                    // Signal UUID
  type:
    | 'document.ingested'        // New financial doc available
    | 'facts.extracted'          // Facts ready for matching
    | 'match.found'              // Auto-matched to transaction
    | 'match.suggested'          // Possible match, needs confirmation
    | 'conflict.detected'        // Mismatch found
    | 'conflict.resolved'        // Conflict was resolved
    | 'document.unmatched';      // No transaction found for document

  tenantId: string;
  timestamp: string;             // ISO 8601

  // Payload varies by type
  payload: {
    documentId: string;
    documentType: string;        // 'receipt', 'invoice', etc.
    trustScore: number;

    // For facts.extracted / match events
    facts?: {
      amount?: { value: number; currency: string; confidence: number };
      vendor?: { value: string; confidence: number };
      date?: { value: string; confidence: number };
      reference?: { value: string; confidence: number };
    };

    // For match events
    match?: {
      transactionId: string;
      confidence: number;
      method: string;
    };

    // For conflict events
    conflict?: {
      type: string;
      severity: string;
      expected: string;
      actual: string;
    };
  };
}
```

## ChittyFinance Integration Points

### What ChittyFinance needs to add

1. **Signal consumer** - Endpoint or queue listener for reconciliation signals
2. **`reconciled` flag** - Already exists on `transactions` table (`system.schema.ts:104`)
3. **`reconciliation_source`** - New field: which document/fact confirmed the transaction
4. **Conflict dashboard** - UI to review and resolve reconciliation conflicts
5. **Document viewer** - Link to view source document in R2

### Proposed ChittyFinance schema additions

```typescript
// Add to transactions table (system.schema.ts)
reconciliationSource: text('reconciliation_source'),  // ChittyLedger document_id
reconciliationScore: decimal('reconciliation_score', { precision: 3, scale: 2 }),
reconciledAt: timestamp('reconciled_at'),

// New table: track signals received
reconciliationSignals: pgTable('reconciliation_signals', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  signalId: text('signal_id').notNull().unique(),
  signalType: text('signal_type').notNull(),
  documentId: text('document_id').notNull(),  // ChittyLedger financial_documents.id
  transactionId: uuid('transaction_id').references(() => transactions.id),
  payload: jsonb('payload'),
  status: text('status').notNull().default('pending'),  // 'pending', 'processed', 'ignored'
  processedAt: timestamp('processed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

### API Endpoints (ChittyFinance)

```
POST /api/reconciliation/signals    -- Receive signals from ChittyLedger-Finance
GET  /api/reconciliation/pending    -- List unmatched documents
GET  /api/reconciliation/conflicts  -- List active conflicts
POST /api/reconciliation/confirm    -- Manually confirm a match
POST /api/reconciliation/dismiss    -- Dismiss a conflict
GET  /api/transactions/:id/documents -- View linked source documents
```

## Infrastructure

### Shared R2 Bucket Strategy

```
chittyos-financial-documents (R2)
├── {tenant_id}/
│   ├── receipts/
│   │   └── {document_id}.pdf
│   ├── invoices/
│   │   └── {document_id}.pdf
│   ├── statements/
│   │   └── {document_id}.pdf
│   └── exports/
│       └── {document_id}.csv
```

Both ChittyLedger-Finance and ChittyFinance bind to this bucket.
ChittyLedger-Finance writes. ChittyFinance reads.

### Signal Delivery Options

| Method | Latency | Complexity | Recommendation |
|--------|---------|------------|----------------|
| Cloudflare Queues | Low | Medium | Production |
| Service binding + direct call | Lowest | Low | If same CF account |
| Webhook POST | Medium | Low | Cross-service/external |
| Polling API | High | Low | Development/fallback |

**Recommended**: Cloudflare Queues for production, webhook POST for development.

## Open Questions

1. Should ChittyLedger-Finance share a database with ChittyLedger core, or have its own?
2. Does ChittyTrace push directly to ChittyLedger-Finance, or through ChittyRouter?
3. Should the R2 bucket be shared or should ChittyFinance copy documents it needs?
4. What tenant ID format is canonical across services? (UUID from ChittyFinance? ChittyID DID?)
