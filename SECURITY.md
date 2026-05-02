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

### OAuth & Webhook Security

- **OAuth state**: HMAC-SHA256 signed tokens, 10-minute expiry, timing-safe verification
- **Stripe webhooks**: Signature verified via `STRIPE_WEBHOOK_SECRET`
- **Mercury webhooks**: Per-tenant HMAC-SHA256 (7 active registrations) — secrets stored encrypted per tenant, not as global env vars
- **Wave webhooks**: Endpoint deployed; per-tenant HMAC registration script pending (parity with Mercury pattern)
- **Idempotency**: All webhook events deduplicated via KV with 7-day TTL
- **ChittyID SSO**: OAuth 2.0 PKCE with code_verifier (PR #72) — primary browser auth path

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
| Mercury Bank | Direct webhooks (per-tenant HMAC) + ChittyConnect proxy (static egress IP) | Read-only account/transaction data |
| Wave Accounting | OAuth 2.0 + GraphQL | Read invoices/expenses |
| Stripe | API key + webhook signatures | Payment processing |
| OpenAI | API key | GPT-4o advice + GPT-4o-mini classification (no PII in prompts) |
| Cloudflare Email | DKIM/SPF + service auth | Inbound `finance@chitty.cc` |

### ChittyOS Integrations

| Service | Auth Method | Direction |
|---------|------------|-----------|
| ChittyAuth | Bearer service token | Inbound (token validation) |
| ChittyID | OAuth 2.0 PKCE | Outbound (SSO) |
| ChittyConnect | Service token | Outbound (Mercury proxy) |
| ChittyDiscovery | Service token | Outbound (self-register + heartbeat) |
| ChittySchema | Service token (advisory, fall-open) | Outbound (schema validation) |
| ChittyChronicle | Service token | Outbound (audit log writes) |

## CI/CD Security

- **CodeQL**: Static analysis on every PR (27 alerts resolved 2026-03-24)
- **Secret scanning**: Working tree scanned for credential patterns
- **Dependency audit**: `npm audit --omit=dev --audit-level high` (or `pnpm audit` if using pnpm-lock)
- **Workflow secret policy**: Enforced via `check-workflow-secrets.sh`
- **Bot detection**: Governance workflow checks `user.type === 'Bot'` (PR #95 hardening)
- **Script injection prevention**: Workflow inputs passed via env vars, not template substitution (PR #95)
- **Workers Builds**: Deployed via Cloudflare's build pipeline (no self-hosted CI secrets); see issue #111 for current 0s-failure investigation

## Known Limitations

1. **Legacy session auth uses SHA-256, not PBKDF2/bcrypt** — acceptable for Workers environment (no Node.js crypto); ChittyID SSO (OAuth 2.0 PKCE) is the primary auth path
2. **No application-level rate limiting** — relies on Cloudflare's built-in DDoS protection; rate limiting on import/classification/webhook endpoints is an open follow-up
3. **Forensic tables use integer IDs** — legacy schema (`shared/schema.ts`), not yet migrated to UUID
4. **ChittySchema client is fall-open** — advisory only, never blocks writes (intentional: schema registry should not gate financial mutations)
5. **ChittyChronicle read-side blocked** — write API works; cases/timeline/search endpoints return 404 (Worker only serves health + manifests). Audit writes succeed but cannot be queried via Chronicle UI.

## Security Contacts

- **Email**: security@chitty.cc
- **GitHub Security Advisories**: https://github.com/CHITTYAPPS/chittyfinance/security/advisories
