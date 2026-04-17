# Security Policy

## Reporting a Vulnerability

**Do NOT report security vulnerabilities through public GitHub issues.**

### Preferred: GitHub Security Advisories

1. Go to https://github.com/CHITTYAPPS/chittyfinance/security/advisories/new
2. Click "Report a vulnerability"
3. Include: description, reproduction steps, affected versions, impact

### Alternative: Email

**security@chitty.cc**

### Response Timeline

- **Initial response**: 24 hours
- **Confirmation**: 48 hours
- **Critical fix**: 7 days
- **High priority fix**: 14 days

We follow coordinated disclosure and will credit reporters unless anonymity is preferred.

## Supported Versions

| Version | Supported |
|---------|-----------|
| Production (Cloudflare Workers) | Yes |
| Development (local Hono) | Best effort |

## Architecture Security Model

### Authentication

- **Browser clients**: KV-backed session cookies (`cf_session`, 7-day TTL)
- **Service-to-service**: Bearer token (`CHITTY_AUTH_SERVICE_TOKEN`)
- **Password hashing**: SHA-256 via Web Crypto API
- **ChittyID SSO**: OAuth 2.0 PKCE (primary auth path)

### Data Isolation

- Multi-tenant PostgreSQL (Neon) with tenant-scoped queries
- All storage methods enforce `tenantId` filtering
- Inter-tenant data access prevented at the storage abstraction layer

### Secret Management

- All secrets delivered via Cloudflare Workers environment bindings
- 1Password is the cold source of truth
- No secrets in code, KV, or R2
- Pre-commit hooks scan for credential patterns

### OAuth Security

- CSRF protection via HMAC-SHA256 signed state tokens (10-minute expiry)
- Webhook signatures verified (Stripe `STRIPE_WEBHOOK_SECRET`, Mercury service auth)
- Idempotent webhook processing with KV-backed deduplication (7-day TTL)

### Classification Trust Path

Financial transaction classification follows a segregated trust model:

| Level | Role | Permissions |
|-------|------|-------------|
| L0 | Ingest (webhook, CSV import) | Write to 9010 (suspense) only |
| L1 | AI/keyword classifier | Write `suggested_coa_code` only |
| L2 | Executor (owner/admin) | Set `coa_code` on unreconciled transactions |
| L3 | Auditor | Lock transactions (reconcile), review L2 classifications |
| L4 | Governance (auditor) | Modify Chart of Accounts |

Reconciled transactions are immutable. All classification changes logged to `classification_audit` with actor, trust level, old/new values, and reason.

## Data Handling

### Financial Data

- Decimal precision (12,2) for all monetary amounts
- Transaction amounts never stored as floating point
- Account numbers masked in logs
- No financial data cached in browser localStorage

### Import Pipeline

- CSV imports validated and parsed server-side only
- SHA-256 deduplication hashes prevent duplicate ingestion
- External IDs prefixed by source (`tt-`, `hd-`, `az-`) for traceability
- Personal spend detection flags non-deductible purchases with `personalUse` metadata

### Vendor Integrations

| Integration | Auth Method | Data Flow |
|-------------|------------|-----------|
| Mercury Bank | Via ChittyConnect (static egress IP) | Read-only account/transaction data |
| Wave Accounting | OAuth 2.0 + GraphQL | Read invoices/expenses |
| Stripe | API key + webhook signatures | Payment processing |
| OpenAI | API key | Financial advice (no PII sent) |

## CI/CD Security

- **CodeQL**: Static analysis on every PR
- **Secret scanning**: Working tree scanned for credential patterns
- **Dependency audit**: `pnpm audit --prod --audit-level high`
- **Workflow secret policy**: Enforced via `check-workflow-secrets.sh`
- **Workers Builds**: Deployed via Cloudflare's build pipeline (no self-hosted CI secrets)

## Known Limitations

1. **Session auth is SHA-256, not PBKDF2/bcrypt** -- acceptable for Workers environment (no Node.js crypto), ChittyID SSO is the primary auth path
2. **No request rate limiting** -- relies on Cloudflare's built-in DDoS protection
3. **Forensic tables use integer IDs** -- legacy schema, not yet migrated to UUID

## Security Contacts

- **Email**: security@chitty.cc
- **GitHub Security Advisories**: https://github.com/CHITTYAPPS/chittyfinance/security/advisories
