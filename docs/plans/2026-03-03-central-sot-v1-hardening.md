> Authoritative Source: /Users/nb/Desktop/Projects/github.com/CHITTYOS/chittyops/compliance/plans/2026-03-03-central-sot-v1-hardening.md
> Mirror Copy: /Users/nb/Desktop/Projects/github.com/CHITTYFOUNDATION/chittyops/docs/plans/2026-03-03-central-sot-v1-hardening.md

# Central SoT v1 Hardening Plan (Model/Channel/Agent Agnostic)

Date: 2026-03-03  
Scope: ChittyOS/ChittyApps multi-channel, multi-model coordination

## 1) Executive Verdict

Current setup is **partially viable**:
- Good local continuity exists in `~/.claude/chittycontext` (session binding, checkpoints, queue).
- Not yet a true central write authority across Claude + Codex + agents.

Recommended direction is viable and should be implemented as a **single authoritative write path** with local caches only as mirrors.

## 2) What Exists Today

Observed implementation:
- Local context store: `~/.claude/chittycontext/`
- Lifecycle hooks:
  - `~/.claude/hooks/chittycontext-session-start.sh`
  - `~/.claude/hooks/chittycontext-session-end.sh`
- Session queueing: `sync_queue.json` with deferred drain
- Canon/entity metadata: `manifest.json`, `canon/ontology.json`

Observed gap:
- Codex has skills that reference this store, but no equivalent automatic lifecycle hook wiring in Codex config.
- This creates divergence risk between local stores and channel-specific session logs.

## 3) v1 Architecture (Recommended)

## Option Chosen: Central Write Gateway + Event Ledger

Single write authority:
- `context.chitty.cc` (or `connect.chitty.cc/context`) as the only write API
- Backing store: Neon/Postgres event ledger + materialized views
- Local files (`~/.claude/chittycontext`, Codex local state) become read-through/write-back caches, never authoritative

Core principle:
- Every mutation is an append-only event with idempotency keys.
- Read models are projections; they can be rebuilt at any time.

## 4) Data and Auth Flow (Text Diagram)

1. Session start
- Client (Claude hook, Codex skill, agent runtime) resolves context anchors.
- Client sends `POST /v1/sessions/start` with `channel`, `model`, `agent_id`, `project`, `workspace`, `anchor_hash`.
- Gateway validates token/scopes with ChittyAuth and resolves/mints ChittyID via ChittyID/ChittyConnect policy.
- Gateway appends event and returns canonical `context_id`, `session_id`, `ledger_head`.

2. During session
- Client sends events to `POST /v1/events` (`checkpoint`, `decision`, `todo`, `task`, `artifact_ref`, `state_update`).
- Each event includes:
  - `idempotency_key`
  - `causation_id`
  - `correlation_id`
  - `occurred_at`
  - `actor_chitty_id` (natural or synthetic)
- Gateway appends; projectors update task/state read models.

3. Session end
- Client sends `POST /v1/sessions/end`.
- Gateway computes summary/projection deltas and emits sync markers.
- Local mirrors pull from `GET /v1/contexts/{id}/state?since=...`.

4. Audit and trust
- All events are attributable to ChittyID.
- Trust/DNA calculators consume event stream asynchronously.
- Chronicle/ledger links are recorded as event metadata.

## 5) Minimal v1 Contracts

Required endpoints:
- `POST /v1/sessions/start`
- `POST /v1/sessions/end`
- `POST /v1/events`
- `GET /v1/contexts/{context_id}/state`
- `GET /v1/contexts/{context_id}/timeline`
- `POST /v1/sync/pull` (for local mirror reconciliation)

Required event classes:
- `session_started`, `session_ended`
- `checkpoint_saved`, `state_compacted`
- `task_created`, `task_updated`, `todo_updated`
- `decision_recorded`, `artifact_linked`
- `sync_conflict_detected`, `sync_conflict_resolved`

Idempotency and ordering:
- Unique constraint on `(source_system, idempotency_key)`
- Logical ordering field: `context_seq` assigned server-side
- Accept out-of-order ingress; replay ordered by `context_seq`

## 6) Security and Governance Baseline

AuthN/AuthZ:
- Service and user tokens from ChittyAuth
- Scope examples:
  - `context:write`
  - `context:read`
  - `context:admin`
  - `context:trust:compute`

Governance:
- ChittyID remains sole identity mint authority.
- Synthetic vs natural actors must both map to auditable ChittyIDs.
- All write calls require actor identity + channel identity.

Compliance controls:
- Immutable append ledger for events
- Redaction policy only via compensating events, never destructive overwrite
- Signed export bundles for legal/audit use

## 7) Rollout Plan

Phase 0: Stabilize contracts (1-2 days)
- Freeze v1 event schema and endpoint contracts.
- Define scope matrix and token requirements.

Phase 1: Central write path (3-5 days)
- Implement gateway + Neon tables.
- Add idempotency and server-side sequencing.

Phase 2: Channel adapters (3-4 days)
- Update Claude start/end hooks to call gateway.
- Add Codex command wrappers/skill helpers for start/end/checkpoint writes.
- Keep local files as mirror cache.

Phase 3: Projection and sync (2-3 days)
- Build `state` and `timeline` projections.
- Add pull-based mirror reconciliation.

Phase 4: Hardening (2-4 days)
- Conflict tests, replay tests, outage tests.
- Observability and SLOs.

## 8) Validation Plan

Reliability tests:
- At-least-once delivery with duplicate ingestion
- Out-of-order event handling
- Replay from event 0 to rebuild read models

Security tests:
- Token scope rejection matrix
- Impersonation attempt rejection (wrong actor/channel binding)
- Secret leakage guard verification at adapter boundaries

Consistency tests:
- Claude + Codex parallel sessions on same project/context
- Conflict creation + deterministic resolution
- Read model convergence within defined lag SLO

Operational SLOs (initial):
- Write p95 < 300ms
- Projection lag p95 < 5s
- Reconciliation catch-up < 60s for normal load

## 9) Why This Is Viable

It preserves what already works:
- Existing local chittycontext semantics and workflows
- Existing ChittyID/ChittyAuth trust model

It fixes what currently breaks:
- Eliminates split authority between `~/.claude` and Codex-local/session-local state
- Adds deterministic merge/replay and formal idempotency
- Makes channel/model/agent differences adapter concerns, not data-model concerns

## 10) Immediate Next Step

Implement a small proof in one repo:
- Add `context event` table + `sessions` table
- Wire one Claude hook and one Codex command to `POST /v1/sessions/start|end` and `POST /v1/events`
- Verify convergence by running parallel sessions against same context for 24 hours
