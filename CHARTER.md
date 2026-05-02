---
uri: chittycanon://docs/ops/policy/chittyfinance-charter
namespace: chittycanon://docs/ops
type: policy
version: 2.0.0
status: COMPATIBLE
registered_with: chittycanon://core/services/canon
title: ChittyFinance Charter
certifier: chittycanon://core/services/chittycertify
visibility: PUBLIC
---

# ChittyFinance Charter

## Classification
- **Canonical URI**: `chittycanon://core/services/chittyfinance`
- **Tier**: 3 (Service Layer)
- **Organization**: CHITTYAPPS
- **Domain**: finance.chitty.cc

## Mission

ChittyFinance is a **full-stack financial management platform** for the ChittyOS ecosystem. It provides intelligent financial tracking, AI-powered advice (GPT-4o), recurring charge optimization, and integrations with Mercury Bank, Wave Accounting, and Stripe payments.

## Scope

### IS Responsible For
- Financial dashboard with real-time summaries + consolidated reporting across entities
- Multi-tenant financial data management (IT CAN BE LLC entity structure)
- Mercury Bank integration (direct webhooks + ChittyConnect proxy with static egress IP)
- Wave Accounting integration (OAuth 2.0 + GraphQL)
- Stripe payment processing and webhooks
- AI financial advice (OpenAI GPT-4o) + AI transaction classification (GPT-4o-mini)
- Database-backed Chart of Accounts with L0→L4 trust-path classification (executor/auditor segregation)
- Recurring charge analysis and optimization
- Property management (CRUD, rent roll, leases, P&L, multi-source valuation)
- Lease expiration notifications (cron + dashboard widget + action queue)
- Inter-company transaction tracking + automated allocation engine (management_fee, cost_sharing, rent_passthrough, custom_pct)
- Transaction export (CSV / OFX 1.x / QFX)
- CSV import pipeline (TurboTenant, Mercury, HD Pro, Amazon Business, REI Hub, Wave sync)
- Schedule E tax workspace + line summary
- Forensic accounting (Benford's Law, duplicate detection, flow of funds, damages calculation)
- GitHub integration for project cost attribution
- Tenant-scoped financial data isolation
- Inbound email handling at `finance@chitty.cc` (Cloudflare Email Service)

### IS NOT Responsible For
- Identity generation (ChittyID)
- Token provisioning (ChittyAuth)
- Service registration (ChittyRegister)
- Evidence management (ChittyLedger)
- Legal case management (ChittyCases)
- Property management UI for end-users (ChittyBooks consumes ChittyFinance as engine)

## Dual-Mode Operation

### Standalone Mode (Local Development)
- SQLite database
- Single-tenant (no multi-tenancy)
- Database file: `./chittyfinance.db`

### System Mode (Production)
- PostgreSQL (Neon) with full multi-tenancy
- IT CAN BE LLC entity structure
- Cloudflare Workers deployment

## IT CAN BE LLC Entity Structure

```
IT CAN BE LLC (holding)
├── JEAN ARLENE VENTURING LLC (personal, 85% owner)
├── ARIBIA LLC (series, 100% owned)
│   ├── ARIBIA LLC - MGMT (management)
│   │   ├── Chicago Furnished Condos (consumer brand)
│   │   └── Chitty Services (vendor/tech services)
│   ├── ARIBIA LLC - CITY STUDIO (property)
│   └── ARIBIA LLC - APT ARLENE (property)
└── ChittyCorp LLC (holding, pending formation)
```

## Dependencies

| Type | Service | Status | Purpose |
|------|---------|--------|---------|
| Upstream | ChittyAuth | Live | Token validation |
| Upstream | ChittyID | Live (PR #72) | OAuth 2.0 PKCE SSO |
| Peer | ChittyConnect | Live | Mercury Bank proxy (static egress IP) |
| Peer | ChittyDiscovery | Live (PR #79) | Service self-registration + heartbeat |
| Peer | ChittySchema | Live | Schema registry (advisory client, fall-open) |
| Peer | ChittyChronicle | Partial | Write-side wired (PR #92); read API endpoints (cases/timeline/search) return 404 |
| Peer | ChittyCert | Pending | Certificate issuance (Phase 5) |
| External | Mercury Bank | Live | Banking + 7 per-tenant HMAC webhooks |
| External | Wave Accounting | Live | Accounting integration |
| External | Stripe | Live | Payment processing |
| External | OpenAI | Live | GPT-4o + GPT-4o-mini |
| External | GitHub | Live | Project cost attribution |
| External | Cloudflare Email | Live (PR #102) | Inbound `finance@chitty.cc` |
| Storage | Neon PostgreSQL | Live | Database (`solitary-rice-14149088`) via Hyperdrive `chittyfinance-db` |
| Storage | Cloudflare KV | Live | Sessions, webhook idempotency, OAuth state |

## API Contract

**Base URL**: https://finance.chitty.cc

### Public (no auth)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/api/v1/status` | GET | Service status |
| `/api/v1/documentation` | GET | OpenAPI spec |
| `/api/session` | GET/POST/DELETE | Session cookie management |
| `/api/auth/chittyid/{authorize,callback}` | GET | ChittyID OAuth 2.0 PKCE |

### Financial Data
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/financial-summary` | GET | Financial summary |
| `/api/transactions` | GET | Transaction list |
| `/api/transactions/export?format=csv\|ofx\|qfx` | GET | Export (CSV / OFX 1.x / QFX) |
| `/api/charges/recurring` | GET | Recurring charges |
| `/api/charges/optimizations` | GET | AI optimization recommendations |
| `/api/charges/manage` | POST | Cancel / modify recurring charge |

### Tenants & Accounts
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/tenants` | GET | List tenants user has access to |
| `/api/tenants/:id/settings` | GET/PATCH | Tenant settings (bulk-accept opt-out, etc.) |
| `/api/accounts` | GET | List bank accounts (tenant-scoped) |

### Properties (Phase 4)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/properties` | GET/POST | List/create |
| `/api/properties/:id` | PATCH | Update |
| `/api/properties/:id/units` | POST | Create unit |
| `/api/properties/:id/units/:unitId` | PATCH | Update unit |
| `/api/properties/:id/leases` | POST | Create lease |
| `/api/properties/:id/leases/:leaseId` | PATCH | Update lease |
| `/api/properties/:id/financials` | GET | NOI, cap rate, cash-on-cash, occupancy |
| `/api/properties/:id/rent-roll` | GET | Unit-level rent roll |
| `/api/properties/:id/pnl?start=&end=` | GET | P&L by REI category |
| `/api/properties/:id/valuation` | GET | Aggregated multi-source AVM |
| `/api/properties/:id/valuation/refresh` | POST | Refresh estimates |
| `/api/properties/:id/valuation/history` | GET | Historical timeline |
| `/api/leases/expiring?days=N` | GET | Expiring leases (default 90 days) |

### Allocations (Phase 6)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/allocations/rules` | GET/POST/PATCH/DELETE | CRUD allocation rules |
| `/api/allocations/preview` | POST | Preview allocation |
| `/api/allocations/execute` | POST | Execute allocation |
| `/api/allocations/runs` | GET | List runs |

### Classification & COA (Phase 3.5)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/classification/queue` | GET | Pending classification queue |
| `/api/classification/suggest` | POST | AI-suggest COA code (L1) |
| `/api/classification/classify` | POST | Set authoritative COA (L2) |
| `/api/classification/bulk-accept` | POST | Bulk-accept high-confidence (≥0.80, ≤$500) |
| `/api/chart-of-accounts` | GET/POST/PATCH | COA admin (L4 owner/admin only) |

### Tax & Reports
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/tax/schedule-e` | GET | Schedule E export |
| `/api/tax/line-summary` | GET | Tax line summary |
| `/api/reports/consolidated` | GET | Consolidated reporting across entities |
| `/api/portfolio` | GET | Portfolio summary |

### Imports (Phase 4)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/import/turbotenant` | POST | TurboTenant CSV (deposits + rent roll) |
| `/api/import/mercury` | POST | Mercury CSV (auto-resolve account) |
| `/api/import/hd-pro` | POST | HD Pro CSV (3K items, 24 job normalizations) |
| `/api/import/amazon` | POST | Amazon Business (returns dedup, payment cards) |
| `/api/import/rei-hub` | POST | REI Hub general ledger |
| `/api/import/wave-sync` | POST | Wave OAuth sync |

### AI Services
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/ai/advice` | POST | GPT-4o financial advice |
| `/api/ai/cost-reduction` | POST | Cost reduction plan |
| `/api/ai/message` | POST | Conversational AI |

### Integrations & Webhooks
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/integrations/status` | GET | Integration config status |
| `/api/integrations/wave/{authorize,callback,refresh}` | GET/POST | Wave OAuth flow |
| `/api/integrations/stripe/{connect,checkout,webhook}` | POST | Stripe customer + checkout + webhook |
| `/api/mercury/{accounts,select-accounts}` | GET/POST | Mercury accounts via ChittyConnect |
| `/api/integrations/{mercury,wave}/webhook` | POST | Webhooks (per-tenant HMAC-SHA256) |

### Forensics (Phase 4)
21 endpoints under `/api/forensics/*` — investigations, evidence, chain-of-custody, Benford's Law, duplicate detection, flow of funds, damages calculation, reports.

## Ownership

| Role | Owner |
|------|-------|
| Service Owner | ChittyOS |
| Technical Lead | @chittyos-infrastructure |
| Contact | finance@chitty.cc |

## Three Aspects (TY VY RY)

Source: `chittycanon://gov/governance#three-aspects`

| Aspect | Abbrev | Question | ChittyFinance Answer |
|--------|--------|----------|--------------------|
| **Identity** | TY | What IS it? | Full-stack financial management platform — intelligent tracking, AI-powered advice, recurring charge optimization for the IT CAN BE LLC entity structure |
| **Connectivity** | VY | How does it ACT? | Mercury Bank via ChittyConnect proxy; Wave Accounting OAuth 2.0 + GraphQL; Stripe payment processing + webhooks; OpenAI GPT-4o financial advice; dual-mode (standalone SQLite / system PostgreSQL multi-tenant) |
| **Authority** | RY | Where does it SIT? | Tier 3 Service — authoritative for financial data aggregation and AI advice; delegates identity to ChittyID, banking connectivity to ChittyConnect, audit logging to ChittyChronicle |

## Document Triad

This charter is part of a synchronized documentation triad. Changes to shared fields must propagate.

| Field | Canonical Source | Also In |
|-------|-----------------|---------|
| Canonical URI | CHARTER.md (Classification) | CHITTY.md (blockquote) |
| Tier | CHARTER.md (Classification) | CHITTY.md (blockquote) |
| Domain | CHARTER.md (Classification) | CHITTY.md (blockquote), CLAUDE.md (header) |
| Endpoints | CHARTER.md (API Contract) | CHITTY.md (Endpoints table), CLAUDE.md (API section) |
| Dependencies | CHARTER.md (Dependencies) | CHITTY.md (Dependencies table), CLAUDE.md (Architecture) |
| Certification badge | CHITTY.md (Certification) | CHARTER.md frontmatter `status` |

**Related docs**: [CHITTY.md](CHITTY.md) (badge/one-pager) | [CLAUDE.md](CLAUDE.md) (developer guide)

## Compliance

- [x] Service registered in ChittyRegistry (`did:chitty:REG-XE6835`, 2026-02-22)
- [x] Health endpoint operational at `/health`
- [x] CLAUDE.md development guide present
- [x] CHARTER.md present
- [x] CHITTY.md present (`type: architecture`)
- [x] SECURITY.md present
- [x] AGENTS.md present
- [x] OAuth security: CSRF-protected HMAC-SHA256 state tokens (10-min expiry)
- [x] Webhook signature verification: Stripe + Mercury (per-tenant HMAC)
- [x] Multi-tenant data isolation enforced at storage abstraction layer
- [x] Classification trust-path: L0→L4 with executor/auditor segregation
- [x] Concurrency-safe reconciled lock (no TOCTOU)
- [x] Ledger audit coverage: all financial mutations write to ChittyChronicle
- [x] ChittyID SSO (OAuth 2.0 PKCE, PR #72)
- [x] Multi-currency (ISO 4217)
- [x] Schema registered with ChittySchema (chittyschema#11)
- [x] Self-registration with ChittyDiscovery (PR #79)

---
*Charter Version: 2.0.0 | Last Updated: 2026-05-02*
