---
uri: chittycanon://docs/ops/architecture/chittyfinance
namespace: chittycanon://docs/ops
type: architecture
version: 2.0.0
status: COMPATIBLE
registered_with: chittycanon://core/services/canon
title: "ChittyFinance"
certifier: chittycanon://core/services/chittycertify
visibility: PUBLIC
---

# ChittyFinance

> `chittycanon://core/services/chittyfinance` | Tier 3 (Service Layer) | finance.chitty.cc

## What It Does

Full-stack financial management platform providing intelligent tracking, AI-powered advice (GPT-4o), recurring charge optimization, and integrations with Mercury Bank, Wave Accounting, and Stripe payments. Supports multi-tenant operation for the IT CAN BE LLC entity structure.

## Architecture

Dual-mode: Hono on Cloudflare Workers (production) with Neon PostgreSQL multi-tenant, or Hono via `@hono/node-server` with SQLite (local dev). React frontend with Vite.

### Stack
- **Runtime**: Cloudflare Workers + Hono (production) / Hono node-server (dev) / Express (legacy `dev:legacy` fallback)
- **Frontend**: React 18 + Vite + shadcn/ui + TanStack Query
- **Database**: Neon PostgreSQL with Drizzle ORM (system) via Hyperdrive `chittyfinance-db` / SQLite (standalone)
- **AI**: OpenAI GPT-4o (advice) + GPT-4o-mini (transaction classification)
- **Payments**: Stripe (checkout, webhooks)
- **Banking**: Mercury Bank (direct webhooks + ChittyConnect proxy with static egress IP)
- **Accounting**: Wave Accounting (OAuth 2.0 + GraphQL)
- **Email**: Cloudflare Email Service (inbound `finance@chitty.cc` + outbound)

### Dual-Mode Operation
| Mode | Database | Tenancy | Deployment |
|------|----------|---------|------------|
| Standalone | SQLite | Single | Local Express |
| System | Neon PostgreSQL | Multi-tenant (IT CAN BE LLC) | Cloudflare Workers |

## Three Aspects (TY VY RY)

Source: `chittycanon://gov/governance#three-aspects`

| Aspect | Abbrev | Answer |
|--------|--------|--------|
| **Identity** | TY | Full-stack financial management platform — intelligent tracking, AI-powered advice, recurring charge optimization for the IT CAN BE LLC entity structure |
| **Connectivity** | VY | Mercury Bank via ChittyConnect proxy; Wave Accounting OAuth 2.0 + GraphQL; Stripe payment processing + webhooks; OpenAI GPT-4o financial advice; dual-mode (standalone SQLite / system PostgreSQL multi-tenant) |
| **Authority** | RY | Tier 3 Service — authoritative for financial data aggregation and AI advice; delegates identity to ChittyID, banking connectivity to ChittyConnect, audit logging to ChittyChronicle |

## ChittyOS Ecosystem

### Certification
- **Badge**: ChittyOS Compatible
- **Certifier**: ChittyCertify (`chittycanon://core/services/chittycertify`)
- **Registered**: 2026-02-22 (`did:chitty:REG-XE6835`)

### ChittyDNA
- **ChittyID**: `did:chitty:REG-XE6835`
- **DNA Hash**: --
- **Lineage**: root (financial management)

### Dependencies
| Service | Status | Purpose |
|---------|--------|---------|
| ChittyAuth | Live | Token validation |
| ChittyID | Live (PR #72) | OAuth 2.0 PKCE SSO |
| ChittyConnect | Live | Mercury Bank proxy (static egress IP) |
| ChittyDiscovery | Live (PR #79) | Service self-registration + heartbeat |
| ChittySchema | Live | Schema registry (advisory, fall-open client) |
| ChittyChronicle | Partial | Audit log writes succeed; API endpoints (cases/timeline/search) return 404 — read-side blocked |
| Mercury Bank | Live | Banking integration (7 per-tenant HMAC webhooks) |
| Wave Accounting | Live | Accounting integration (OAuth 2.0 + GraphQL) |
| Stripe | Live | Payment processing |
| OpenAI | Live | GPT-4o advice + GPT-4o-mini classification |
| Neon PostgreSQL | Live | Primary database (project `solitary-rice-14149088`) |
| ChittyCert | Pending | Certificate issuance (Phase 5 remaining) |
| ChittyConnect MCP | Pending | MCP integration (Phase 2 remaining) |

### Endpoints

Surfaced by 33 route modules under `server/routes/`. Categorized below; full reference in [CHARTER.md](CHARTER.md) and [CLAUDE.md](CLAUDE.md).

| Category | Sample Paths | Auth |
|----------|--------------|------|
| Health/Docs | `/health`, `/api/v1/status`, `/api/v1/documentation` | No |
| Session | `/api/session` (GET/POST/DELETE) | No (sets cookie) |
| ChittyID SSO | `/api/auth/chittyid/{authorize,callback}` | No |
| Tenants | `/api/tenants`, `/api/tenants/:id/settings` | Hybrid |
| Accounts | `/api/accounts` | Hybrid |
| Transactions | `/api/transactions`, `/api/transactions/export?format=csv\|ofx\|qfx` | Hybrid |
| Properties | `/api/properties` (CRUD), `/api/properties/:id/{financials,rent-roll,pnl,valuation}` | Hybrid |
| Leases | `/api/leases/expiring`, `/api/properties/:id/leases` | Hybrid |
| Allocations | `/api/allocations/{rules,preview,execute,runs}` | Hybrid |
| Classification | `/api/classification/{queue,suggest,classify,bulk-accept}` | Hybrid |
| COA Admin | `/api/chart-of-accounts` (L4 owner/admin) | Hybrid |
| Tax | `/api/tax/schedule-e`, `/api/tax/line-summary` | Hybrid |
| Reports | `/api/reports/consolidated`, `/api/portfolio` | Hybrid |
| Imports | `/api/import/{turbotenant,mercury,hd-pro,amazon,wave-sync,rei-hub}` | Hybrid |
| Forensics | `/api/forensics/*` (21 endpoints) | Hybrid |
| AI | `/api/ai/{advice,cost-reduction,message}` | Hybrid |
| Integrations | `/api/integrations`, `/api/integrations/status`, `/api/integrations/wave/{authorize,callback,refresh}`, `/api/integrations/stripe/{connect,checkout,webhook}` | Mixed |
| Mercury | `/api/mercury/{accounts,select-accounts}` | Hybrid |
| Webhooks | `/api/integrations/{stripe,mercury,wave}/webhook` | Signature-verified |
| Email | `/api/email/*`, inbound handler for `finance@chitty.cc` | Hybrid |
| MCP | `/api/mcp/*` | Bearer |
| Tasks | `/api/tasks` | Hybrid |

## Document Triad

This badge is part of a synchronized documentation triad. Changes to shared fields must propagate.

| Field | Canonical Source | Also In |
|-------|-----------------|---------|
| Canonical URI | CHARTER.md (Classification) | CHITTY.md (blockquote) |
| Tier | CHARTER.md (Classification) | CHITTY.md (blockquote) |
| Domain | CHARTER.md (Classification) | CHITTY.md (blockquote), CLAUDE.md (header) |
| Endpoints | CHARTER.md (API Contract) | CHITTY.md (Endpoints table), CLAUDE.md (API section) |
| Dependencies | CHARTER.md (Dependencies) | CHITTY.md (Dependencies table), CLAUDE.md (Architecture) |
| Certification badge | CHITTY.md (Certification) | CHARTER.md frontmatter `status` |

**Related docs**: [CHARTER.md](CHARTER.md) (charter/policy) | [CLAUDE.md](CLAUDE.md) (developer guide)
