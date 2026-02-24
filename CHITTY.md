---
uri: chittycanon://docs/ops/summary/chittyfinance
namespace: chittycanon://docs/ops
type: summary
version: 1.0.0
status: CERTIFIED
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

Dual-mode: Hono on Cloudflare Workers (production) with Neon PostgreSQL multi-tenant, or Express with SQLite (local dev). React frontend with Vite.

### Stack
- **Runtime**: Cloudflare Workers + Hono (production) / Express (dev)
- **Frontend**: React 18 + Vite + shadcn/ui + TanStack Query
- **Database**: Neon PostgreSQL with Drizzle ORM (system) / SQLite (standalone)
- **AI**: OpenAI GPT-4o (financial advice)
- **Payments**: Stripe (checkout, webhooks)
- **Banking**: Mercury Bank (via ChittyConnect proxy)
- **Accounting**: Wave Accounting (OAuth 2.0 + GraphQL)

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
- **Last Certified**: --

### ChittyDNA
- **ChittyID**: --
- **DNA Hash**: --
- **Lineage**: root (financial management)

### Dependencies
| Service | Purpose |
|---------|---------|
| ChittyAuth | Token validation |
| ChittyConnect | Mercury Bank proxy |
| Mercury Bank | Banking integration |
| Wave Accounting | Accounting integration (OAuth) |
| Stripe | Payment processing |
| OpenAI | AI financial advice (GPT-4o) |
| Neon PostgreSQL | Primary database |

### Endpoints
| Path | Method | Auth | Purpose |
|------|--------|------|---------|
| `/health` | GET | No | Health check |
| `/api/financial-summary` | GET | Bearer | Financial summary |
| `/api/transactions` | GET | Bearer | Transaction list |
| `/api/recurring-charges` | GET | Bearer | Recurring charges |
| `/api/recurring-charges/:id/optimizations` | GET | Bearer | AI optimization suggestions |
| `/api/integrations/status` | GET | Bearer | Integration config status |
| `/api/integrations/wave/authorize` | GET | Bearer | Wave OAuth flow |
| `/api/integrations/stripe/connect` | POST | Bearer | Stripe customer setup |
| `/api/integrations/stripe/webhook` | POST | No | Stripe webhook receiver |
| `/api/mercury/accounts` | GET | Bearer | Mercury accounts via ChittyConnect |
| `/api/ai/advice` | POST | Bearer | AI financial advice |
| `/api/ai/message` | POST | Bearer | Conversational AI |

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
