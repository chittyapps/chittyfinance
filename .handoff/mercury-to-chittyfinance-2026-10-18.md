# Mercury -> ChittyFinance | Engineering execution handoff

**As of:** 2026-10-18 (America/Chicago)  
**Status:** INCOMPLETE / FAIL CLOSED  
**Handoff class:** warm transfer + pre-exit risk snapshot  
**Authority:** existing ChittyConnect, ChittySecrets, chittyconnect-finance and ChittyFinance only. This file is a handoff, **not** a tracker, credential store, new canonical capability, or production deployment.  
**Canonical SOT:** ChittyFinance accounting ledger; ChittyConnect provider authority/dispatch; ChittySecrets secret custody; chittyconnect-finance reconciliation/identity adapter.

## 1. Objective and completion standard

Finish the **single existing webhook-first Mercury -> ChittyFinance banking loop**, not merely its pull requests. Every scheduled execution must inspect Mercury provider and webhook status first, apply the reliable activity gate *before* opening ChittyFinance/Neon, and only then reconcile eligible changes using exact pre-existing business and bank-account bindings and source-transaction idempotency.

**Completion means all of the following are independently proven:**

1. ChittyConnect production privately verifies webhook signatures through ChittySecrets and durably accepts a valid provider-org-specific reconciliation intent.
2. A **deployed** ChittyFinance private readiness/consume contract executes the canonical chittyconnect-finance reconciliation adapter, returns a true success receipt **only when real reconciliation has completed**, and provides retryable failure on any consumer, account binding, source-ownership, provenance or credential gate.
3. The deployed queue consumer actually delivers, retries, dead-letters and acknowledges only valid, org-/idempotency-key-matched completion receipts.
4. Finance and Mercury provider organization/account IDs resolve exactly, without guessing from credential labels, masked account numbers, tenant IDs or DBA names. FC and CHIT both project to ARIBIA LLC - MGMT, but distinct provider organizations remain distinct webhook boundaries.
5. Provider/receiver verification proves any repaired webhook works. Existing seven active webhook endpoints remain undisturbed until a tested cutover.
6. The activity gate respects provider timestamp/status/pagination coverage. Unknown coverage fails closed **without waking Finance/Neon** merely because Mercury ignored `postedStart`.
7. Live deployment versions and source-to-ledger receipts, not GitHub merge alone, demonstrate success.

No new database, ledger, checkpoint store, tracker, external credential store, business registry, or new canonical service. No artificial provider write for testing.

## 2. GitHub state verified in current handoff turn

| Component | Verified reference | State at handoff |
| --- | --- | --- |
| ChittyConnect dispatch | [PR #343](https://github.com/chittyos/chittyconnect/pull/343), merge `a080afa8bd22c2e88e9c3beeaa9546dc776c49a9` | **Merged**, not independently runtime-verified in this handoff turn. Prior comments incorrectly described it as open. |
| ChittyFinance source owner | [PR #203](https://github.com/chittyapps/chittyfinance/pull/203), merge `1ff62296c4f416fc795c23ab19e73dee6b8a77fa` | Merged. |
| ChittyFinance webhook containment | [PR #202](https://github.com/chittyapps/chittyfinance/pull/202), merge `331b4b0e73c492314a38ec3313c2f40ddcbc71de` | Merged; an earlier run verified deployed, but re-check live deployment before new claims. |
| Finance adapter global source-owner preflight | [chittyconnect-finance PR #22](https://github.com/chittyos/chittyconnect-finance/pull/22), merge `95b3702359284d8e6af41df51dd0a37da7665b81` | Merged library; embedding in deployed Finance/Connect is **not proven**. |
| Finance account-binding preflight | [ChittyFinance PR #204](https://github.com/chittyapps/chittyfinance/pull/204), head `c2851ccf36b93f38861f9855ba583c17f9a676ed` | **Open draft**, unmerged. |
| Finance raw-KV secret-write containment | [ChittyFinance PR #197](https://github.com/chittyapps/chittyfinance/pull/197), head `93cdb7d9de04b55df06e34954c39d207bbebbf98` | **Open**, unmerged. Does **not** complete secret migration. |
| Finance private consumer | `server/routes/internal-chittyconnect.ts` on ChittyFinance `main`, blob `70d9649bf9c1c7c8456c1e22ec73976568e42e85` | **Neither** `/internal/chittyconnect/mercury-reconciliation/readiness` **nor** `/consume` is present. |

The current ChittyConnect `main` `src/index.js` contains an `acceptMercuryReconciliationIntent` entrypoint. **Do not infer its production deployment** from source. The branch `fix/mercury-durable-consumer-20261012` was merged/deleted via PR #343. Do not attempt to revive it.

A prior chat wrote timestamp/negative-receipt tests into PR #343 before its merge. Treat these as merged *source changes*, not evidence of a running consumer. Re-fetch diffs and CI if validating these changes.

## 3. Concrete missing contract

PR #343 sends nonsecret `mercury.reconciliation` intents into the existing `github-events` Cloudflare Queue after requesting Finance `/readiness`. Its queue consumer expects Finance `/consume` to return a completion receipt matching the event's organization and idempotency key. Finance currently lacks these endpoints. Therefore:

- **Existing durable dispatch is not a completed reconciliation consumer.**
- Queue inclusion is not ledger application; a queue acceptance receipt is not a Finance completion receipt.
- Do not install stub success endpoints returning 200/`processed:true` without accounting work; that is a false-acknowledgment bug.
- Because `github-events` also handles non-financial traffic, verify routing isolation, retries/dead-letter policy, access restrictions and capacity. Reuse existing approved infrastructure only after proof of safety; do not invent an additional queue as a reflex.

The correct implementation home is the *existing* ChittyConnect execution layer invoking the domain-specific `chittyconnect-finance` adapter, with ChittyFinance private Finance-SOT queries and governed ledger ingestion. ChittyAgent-Finance remains read-only and must not become a second ingestion pipeline.

## 4. Business and provider partition invariants

Business-first mapping (not based on credential code): `ARIBIA=ARIBIA LLC`; `FC=FURNISHED-CONDOS.COM -> ARIBIA LLC - MGMT`; `CHIT=Chitty Services -> ARIBIA LLC - MGMT`; `CITY=ARIBIA LLC - CITY STUDIO`; `APT=ARIBIA LLC - APT ARLENE`; `ICB=IT CAN BE LLC`; `JAVL=JEAN ARLENE VENTURING LLC`; `MNW=MR NICE WEIRD LLC`; `NAJB=Nicholas Bianchi personal`. Reject `APTA`.

Provider organizations needing attention based on historical Mercury evidence (re-enumerate before acting):
- CHIT external organization `9082ea0c-07a8-11ef-b331-734021561438`: no webhook as of the earlier verified scan.
- MNW external organization `da9e0582-9b2e-11ed-ba2f-ef72030b5034`: no webhook as of the earlier verified scan.
- FC **distinct** external organization `e15f4a46-e328-11ee-9e22-5f2c16c0b48b`: cannot share a webhook with CHIT just because both map to ARIBIA LLC - MGMT.
- Seven provider webhook endpoints were previously active on legacy receiver paths; **do not modify/delete/duplicate** without fresh provider and receiver verification.

`tenant_id` partitions storage; it never substitutes for legal identity. Preserve organization ID, account ID, source-transaction ID, credential reference/projection and connector provenance. Dedupe FC/CHIT transaction overlap globally by native Mercury source identity; legacy `mercury:csv:*` identifiers require separate provenance treatment.

## 5. Finance/accounting findings needing exact source verification

A previous read-only comparison of FC October 11 Mercury records against canonical Neon database `chittyfinance` (not seed `neondb`) found 4 posted provider transactions and only 1 matching native source transaction ID in Finance. That Finance record was attributed to an account labeled Mami Rental Income whereas Mercury source checking ended **0374**; the apparent MGMT Operating **0374** account lacked authoritative provider `external_id` binding. Three source IDs remained unmatched. **This is an unresolved discrepancy**, not an instruction to post or remap rows.

A previous Finance read counted 42 Mercury-labeled accounts, 28 without `external_id`, including 21 under ARIBIA LLC - MGMT. Revalidate using production binding and record-level provenance, because metadata/display labels alone cannot prove ownership. Do not auto-provision financial accounts or entities. The prior runtime also had two duplicated legacy `mercury:csv:*` identifiers across tenant/account partitions; do not normalize them to native Mercury IDs.

Production Neon project previously identified as `solitary-rice-14149088`; verify the exact ChittyFinance database/binding before use. **Never wake Neon as a routine hourly read:** this is a handoff investigation, while the hourly banking loop must apply its Mercury activity gate first.

## 6. Secrets and governed writes: hard stop conditions

- Historical ChittyFinance `server/books/webhooks.ts` stored per-tenant webhook signing secrets as plaintext in `FINANCE_KV`; PR #197 is containment only. Do not add further KV plaintext secrets or disrupt existing seven active endpoints.
- Credentials stay in ChittySecrets; ChittyConnect carries stable handles and resolves at brokered execution boundary, never plaintext Worker bindings, KV, DB, logs or config. Existing identifiers: `MERCURY_TOKEN_*` and `MERCURY_WRITE_TOKEN_{ARIBIA,FC,CHIT,CITY,APT,ICB,JAVL,MNW,NAJB}`; never `MERCURY_ISSUED_*`.
- Every Mercury write requires `MERCURY_EGRESS_URL` -> static-egress `mercury-proxy`, runtime-resolved `MERCURY_EGRESS_PROXY_TOKEN`, Access service-token handles, correct organization write-token reference, allowlisted method/path, verified egress IP, Mercury allowlist/scope, deterministic idempotency and an audit receipt.
- Staging may not resolve production Mercury write/proxy/Access credentials.
- Signing-secret custody must be verified per provider organization and preserve native HMAC verification before CHIT/MNW webhook repair. No simulated provider writes.

## 7. Exact restart loop (do not stop at PR creation)

1. **GitHub drift check:** fetch ChittyConnect #343, Finance #197/#202/#203/#204 and middleware #21/#22; inspect current default branches and remaining open PRs. Check the branch/file status recorded here before editing.
2. **Provider/current deployment check:** inspect production Cloudflare `chittyconnect` and `chittyfinance` deployed version + private service bindings; enumerate Mercury credential boundaries/webhooks using approved brokered reads; inspect any existing queue consumer logs without leaking secrets.
3. **Finish Finance consumer contract:** add private `readiness` and `consume` endpoints only after defining authoritative runtime adapter invocation, existing account/tenant resolver, source-ownership coverage, existing retry/checkpoint mechanism, and precisely what a durable completed receipt means. Fail with retryable non-2xx if no actual consumer, binding or ledger-ingestion authority exists.
4. **Reconcile against existing adapter:** consume only events for which the verified provider state and activity gate authorize Finance reads. Resolve business/DBA and account binding first, then source ownership across all partitions. Do not assume every provider event becomes a ledger row; pending/state/balance changes trigger reconciliation even with no posted transaction.
5. **Test negation, not just happy paths:** unknown org, wrong tenant, FC/CHIT overlap, duplicate source ID, unbound account, partial Mercury page, undated pending transition, invalid timestamp, malformed Finance success receipt, queue retry, transient Finance error, denied credential, stale consumer version, KV failure, legacy webhook compatibility, and arbitrary direct-public-call rejection.
6. **Review/CI/merge:** inspect source diff and run scoped tests/typecheck/security/CI. Merge only the explicitly authorized, fully verified bounded code. A merge is not deployment.
7. **Deploy and prove runtime:** verify build/deployment IDs, service binding, access path and negative/positive integration receipts. Re-read Mercury state, prove consumer execution and Finance source-id result; only then report an endpoint/event repaired. If a permission/credential/provider gate blocks execution, name the exact independently verified gate and stop that mutation—not the investigation.
8. **Re-check original defect:** no falsely acknowledged intents, no duplicate ledger rows, no raw secret persistence, seven legacy receivers remain healthy, CHIT/MNW status source-verified. Never label partial fixes "operational."

## 8. Pending decisions and explicit non-actions

- `github-events` queue co-tenancy: requires isolation/retry/DLQ security and finance latency decision before activation; do not create a new queue by default.
- Canonical service registry drift was observed historically: ChittyConnect charter URI vs registry alias, `chittyconnect-finance` charter misidentified as canon, and a stale `finance.chitty.cc` service projection. Reverify authoritative registry before modifying identity.
- No new service, cron task, tracker, database, source of truth, business entity/account, secret binding or webhook created by this handoff.
- Do not revive merged branches or replay historical Mercury transactions simply to demonstrate liveness.
- Do not interpret CI passing, queue enqueue, PR merge, or a 202 receiver response as completion.
- Legal/evidence exports are outside this banking loop.

## 9. Verification evidence and next owner

**Current handoff verified directly through connected GitHub:** PR #343 merged; #203 and #202 merged; middleware #22 merged; #204 draft open; #197 open; Finance `main` private routes missing readiness and consume. Production receipts and Mercury provider state were **not freshly checked in this handoff turn**; prior findings above are historical and explicitly require revalidation.

**Next owner:** engineering executor operating with authorized ChittyConnect, ChittySecrets, chittyconnect-finance, ChittyFinance, Cloudflare and GitHub actions. Begin at Finance private consumer contract; do not open new governance/tracking work for the same defect.

**Suggested resume instruction:** `Resume the existing Mercury -> ChittyFinance handoff at .handoff/mercury-to-chittyfinance-2026-10-18.md. First revalidate refs, current production, provider state and authority gates. Complete the Finance readiness/consume consumer using canonical chittyconnect-finance, run CI, then pursue verified deployment and end-to-end receipts. No invented successes or new stores.`
