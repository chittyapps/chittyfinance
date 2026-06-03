---
uri: chittycanon://docs/ops/agents/chittyfinance
namespace: chittycanon://docs/ops
type: agents
version: 1.0.0
status: COMPATIBLE
registered_with: chittycanon://core/services/canon
title: "ChittyFinance Agent Registry"
visibility: PUBLIC
---

# ChittyFinance Agent Registry

Registry of AI agents, ChittyOS subagents, and MCP capabilities relevant to ChittyFinance.
Companion to [CHITTY.md](CHITTY.md), [CHARTER.md](CHARTER.md), [SECURITY.md](SECURITY.md), and [CLAUDE.md](CLAUDE.md).

## Internal AI Agents (run by ChittyFinance)

### Transaction Classification (GPT-4o-mini)
- **Source**: `server/lib/ai-classifier.ts`
- **Trigger**: Mercury webhook ingest (PR #90), CSV import L1 suggest pass
- **Trust level**: L1 — writes `suggested_coa_code` only, never `coa_code`
- **Confidence floor**: 0.80 for bulk-accept eligibility (≤$500, exclude 9010 suspense)
- **Fallbacks**: Keyword matcher → vendor map → suspense (9010); never throws — always returns a suggestion
- **Audit**: Every suggestion writes to `classification_audit` with actor `system:ai-classifier`

### Financial Advice (GPT-4o)
- **Source**: `server/lib/openai.ts`
- **Endpoints**: `/api/ai/advice`, `/api/ai/cost-reduction`, `/api/ai/message`
- **Max tokens**: 500 per request
- **PII policy**: No account numbers or tenant identifiers sent in prompts; only aggregated financial context
- **Fallback**: Rule-based advice when `OPENAI_API_KEY` is unset

### Recurring Charge Optimizer
- **Source**: `server/lib/chargeAutomation.ts`
- **Endpoint**: `/api/charges/optimizations`
- **Recommendations**: cancel / downgrade / consolidate / negotiate

## MCP Capabilities Exposed by ChittyFinance

Mounted under `/api/mcp/*`. Resources include:
- Financial summaries (tenant-scoped)
- Transaction queries
- Property financials (NOI, cap rate, occupancy)
- Allocation rule preview
- Schedule E line summary

Authentication: Bearer service token. See [SECURITY.md](SECURITY.md).

> ⚠️ **Phase 2 remaining**: ChittyConnect MCP integration not yet wired. Internal MCP routes work today; cross-service MCP discovery via ChittyConnect is pending.

## ChittyOS Agents That Interact with ChittyFinance

| Agent | Direction | Purpose |
|-------|-----------|---------|
| `chittyagent-schema` | Inbound (advisory) | Validates `chart_of_accounts`, `classification_audit`, `transactions` schemas; client is fall-open |
| `chittyagent-register` | Outbound (one-time) | Service registered as `did:chitty:REG-XE6835` (2026-02-22) |
| `chittyagent-connect` | Outbound (runtime) | Mercury Bank proxy — every bank API call routes through ChittyConnect |
| `chittyagent-canon` | Inbound (CI) | Audits this repo for canonical pattern adherence |
| `chittyagent-cloudflare` | Outbound (admin) | Hyperdrive, KV, Email Service, WAF rules |
| `chittyagent-notion` | Outbound (state) | Project + Actions DB updates from session lifecycle hooks |

## ChittyOS Subagents Useful for Development

When working in this repo, prefer these subagents (see user's `~/.claude/agents/`):

| Subagent | When to Use |
|----------|-------------|
| `chittyschema-overlord` | Before modifying `database/system.schema.ts` — validates cross-schema impact |
| `chittycanon-code-cardinal` | After writing code touching entity types (P/L/T/E/A) — audits canonical adherence |
| `chittyconnect-concierge` | When adding a new third-party integration or managing credentials |
| `chittyregister-compliance-sergeant` | When updating registration payload or troubleshooting registration failures |
| `chittyagent-neon-schema` | Before deploying — detects drift between Neon DB and service code expectations |
| `chittystorage-sasquatch` | When ingesting documents (CSV imports, bank statements, evidence) |
| `claude-integration-architect` | When designing Claude Skills, MCP servers, or extension integrations |

## Agent Interaction Boundaries

**ChittyFinance never delegates these to external agents:**
- Classification authority (L2 `coa_code` writes) — only authenticated executors with `tenant_users.role` ∈ {owner, admin, manager}
- Reconciled-row mutations — concurrency-locked at the SQL layer
- COA modifications (L4) — only `tenant_users.role` ∈ {owner, admin}
- Webhook signature verification — never bypassed for any agent caller

**ChittyFinance does delegate these to external agents:**
- Identity (ChittyID via OAuth 2.0 PKCE)
- Token validation (ChittyAuth)
- Schema authority (ChittySchema, advisory)
- Audit log canonicality (ChittyChronicle write-side)
- Discovery + heartbeat (ChittyDiscovery)

## Adding a New Agent Integration

1. Read [CHARTER.md](CHARTER.md) — understand scope boundaries (what ChittyFinance IS / IS NOT responsible for)
2. Read upstream service's `CHARTER.md` and `CHITTY.md` — never guess the contract
3. Auth via service token (`Authorization: Bearer ...`) — credentials retrieved at runtime via Cloudflare Secrets, never hardcoded
4. If the agent will write to financial state, document its trust level (L0–L4) and audit trail before merging
5. Update this file and CHARTER.md Dependencies table

## Related Documentation

- [CHITTY.md](CHITTY.md) — Architecture summary + ecosystem position
- [CHARTER.md](CHARTER.md) — API contract + scope + dependencies
- [SECURITY.md](SECURITY.md) — Security model + integration auth patterns
- [CLAUDE.md](CLAUDE.md) — Developer guide + commands
