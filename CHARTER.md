# ChittyFinance Charter

## Classification
- **Canonical URI**: `chittycanon://core/services/chittyfinance`
- **Tier**: 3 (Service Layer)
- **Organization**: CHITTYOS
- **Domain**: finance.chitty.cc

## Mission

ChittyFinance is a **full-stack financial management platform** for the ChittyOS ecosystem. It provides intelligent financial tracking, AI-powered advice (GPT-4o), recurring charge optimization, and integrations with Mercury Bank, Wave Accounting, and Stripe payments.

## Scope

### IS Responsible For
- Financial dashboard with real-time summaries
- Multi-tenant financial data management (IT CAN BE LLC entity structure)
- Mercury Bank integration (via ChittyConnect)
- Wave Accounting integration (OAuth 2.0 + GraphQL)
- Stripe payment processing and webhooks
- AI financial advice (OpenAI GPT-4o)
- Recurring charge analysis and optimization
- Property management (rent roll, leases)
- Inter-company transaction tracking
- GitHub integration for project cost attribution
- Tenant-scoped financial data isolation

### IS NOT Responsible For
- Identity generation (ChittyID)
- Token provisioning (ChittyAuth)
- Service registration (ChittyRegister)
- Evidence management (ChittyLedger)
- Legal case management (ChittyCases)

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

| Type | Service | Purpose |
|------|---------|---------|
| Upstream | ChittyAuth | Token validation |
| Upstream | ChittyID | Identity (planned) |
| Peer | ChittyConnect | Mercury Bank proxy |
| Peer | ChittyChronicle | Audit logging (planned) |
| External | Mercury Bank | Banking integration |
| External | Wave Accounting | Accounting integration |
| External | Stripe | Payment processing |
| External | OpenAI | AI financial advice |
| External | GitHub | Project cost attribution |
| Storage | Neon PostgreSQL | Database |

## API Contract

**Base URL**: https://finance.chitty.cc

### Financial Data
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/financial-summary` | GET | Financial summary |
| `/api/transactions` | GET | Transaction list |
| `/api/recurring-charges` | GET | Recurring charges |
| `/api/recurring-charges/:id/optimizations` | GET | AI optimization |

### Integrations
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/integrations/status` | GET | Integration config status |
| `/api/integrations/wave/authorize` | GET | Wave OAuth flow |
| `/api/integrations/stripe/connect` | POST | Stripe customer |
| `/api/integrations/stripe/webhook` | POST | Stripe webhooks |
| `/api/mercury/accounts` | GET | Mercury accounts |

### AI Services
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/ai/advice` | POST | Financial advice |
| `/api/ai/cost-reduction` | POST | Cost reduction plan |
| `/api/ai/message` | POST | Conversational AI |

## Ownership

| Role | Owner |
|------|-------|
| Service Owner | ChittyOS |
| Technical Lead | @chittyos-infrastructure |
| Contact | finance@chitty.cc |

## Compliance

- [ ] Service registered in ChittyRegistry
- [ ] Health endpoint operational at /health
- [ ] CLAUDE.md development guide present
- [ ] CHARTER.md present
- [ ] CHITTY.md present
- [ ] OAuth security (CSRF-protected state tokens)
- [ ] Webhook signature verification (Stripe)
- [ ] Multi-tenant data isolation

---
*Charter Version: 1.1.0 | Last Updated: 2026-02-21*
