# Finance AI Search + Gateway Routing

Build manifest for the Cloudflare AI Search instance backing finance, real estate, tax
and compliance work, and for the AI Gateway dynamic route in front of it.

Status: **built and verified 2026-09-17** for internal canon; external corpus pending. See §6. Infrastructure creation routes through
ChittyConnect per the sensitive-intent contract and is operator-approved per item.

Discovery, 2026-09-17, account ChittyCorp LLC (`0bc21e3a…`):

- AI Search instances: **none**. Namespaces `default` and `legal-cases` exist, both
  without instances.
- AI Gateways: `central` (600s cache, 100/60s), `finance` (300s cache, 50/60s),
  `chittycounsel`, `default`.
- Dynamic routes: **none**, on any gateway.
- AI Search supports direct item upload, so no R2 bucket or pipeline is required.

## 1. Instance

One instance in a `finance` namespace, filtered by metadata rather than split across
instances — cross-jurisdiction questions ("what applies to a furnished 30-day let in
Chicago held by a Wyoming LLC") must answer in one pass.

| Setting | Value | Why |
|---|---|---|
| namespace | `finance` | Separate from `legal-cases`: tax reference and litigation evidence have different retention and privilege handling |
| `ai_gateway_id` | `finance` | Inherits the existing cache, logging and rate limit; all retrieval spend lands on one gateway |
| `cache` / `cache_ttl` | on / 172800 (48h) | Statutes and forms change slowly; a long TTL is the point |
| `cache_threshold` | `close_enough` | Tax questions are asked in many phrasings |
| `chunk` | on, overlap 10 | Statutory text splits badly at hard boundaries |
| `fusion_method` | `rrf` | Hybrid keyword + vector; code and line-number lookups need the keyword leg |

### Metadata taxonomy (hard cap: 5 fields)

| Field | Type | Values |
|---|---|---|
| `jurisdiction` | text | `us-federal`, `il`, `il-chicago`, `il-cook`, `wy`, `fl`, `co` (Colombia), `internal` |
| `authority` | text | `statute`, `regulation`, `form`, `guidance`, `internal-canon`, `commentary` |
| `doc_type` | text | `form`, `instructions`, `publication`, `ordinance`, `code`, `policy`, `memo`, `record` |
| `effective_year` | number | Tax year or ordinance year; filters stale guidance |
| `source_url` | text | Provenance. Every item must carry one |

`authority` is what stops commentary being cited as law. Retrieval for anything that
touches a filing must filter to `statute`, `regulation` or `form` and treat
`commentary` as a pointer only.

## 2. Corpus

Every item needs a `source_url`, and only primary sources for anything load-bearing.

### Internal canon (`jurisdiction: internal`, `authority: internal-canon`)

- `docs/CHART-OF-ACCOUNTS.md` — authoritative chart, IRS line mapping, flow of funds,
  Mercury design
- `CHARTER.md`, `CHITTY.md`, `AGENTS.md`, `CLAUDE.md`, `SECURITY.md`
- The books program (#158) and its phase decisions
- `scripts/remediation/*.sql` — what was changed in the books and why

### US federal tax (`jurisdiction: us-federal`)

- Form 8825 + instructions — rental real estate for partnerships (what ARIBIA files)
- Form 1065 + instructions; Schedule K-1; Schedule B-2 if elected out of BBA
- Schedule E (Form 1040) + instructions
- Form 4562 + instructions — depreciation
- Pub 527 — residential rental property
- Pub 925 — passive activity and at-risk rules
- Pub 946 — depreciation (MACRS, class lives)
- Pub 535 successor guidance — business expenses
- Tangible property regulations (§1.263(a)-3) — repair vs improvement, safe harbours
- §469 material participation; §199A qualified business income for rentals
- Form 1099-NEC + instructions — contract labor (5015)
- FinCEN beneficial ownership reporting — current status and any injunction history

### Illinois, Chicago, Cook County

- Chicago Residential Landlord and Tenant Ordinance — security deposit segregation,
  interest, and the penalty provisions (`il-chicago`, `ordinance`)
- Illinois Security Deposit Return Act and Interest Act
- Chicago shared housing / vacation rental rules — the boundary a 30-day-plus let sits
  on, and what tips an operation into regulated short-term rental
- Cook County assessment, appeal cycle, and property tax calendar
- Illinois LLC Act: annual report, registered agent, franchise obligations
- Illinois transfer taxes on property disposal

### Wyoming (`jurisdiction: wy`)

IT CAN BE LLC is a Wyoming entity, so its obligations are not Illinois's.

- Wyoming LLC Act — formation, operating agreement, member rights
- Annual report and license tax (asset-based, not income-based)
- Registered agent requirement — the registered-agent spend (5050/6040) traces here
- Charging-order protection — why the entity is in Wyoming at all
- No state income tax: confirms filings are federal plus the property's situs state

### Florida and Colombia

- Florida: residential landlord-tenant statute (Chapter 83), sales/tourist development
  tax on short stays, LLC registration if property is held there
- Colombia: the Arias matter — foreign asset reporting exposure (FBAR, FATCA, Form
  8938), and Colombian property or rental obligations where they bear on recovery.
  Cross-reference the `legal-cases` namespace rather than duplicating evidence here.

### Governance and compliance (explicit, not assumed)

- Entity formation documents and operating agreements for each entity, with the ARIBIA
  2024 partnership timeline (member changes mid-year drive K-1 allocations)
- Annual report and registered-agent calendars per state
- Beneficial ownership / CTA reporting posture
- The ARIBIA → JonesCo transition and what it changes for filings
- ChittyOS governance canon that binds this repo: entity types, trust levels L0–L4,
  the sensitive-intent contract
- IRS correspondence posture: CP504, CP59, Form 911, the LITC engagement

## 3. Gateway dynamic route (`finance`)

Tier by task so mechanical work cannot silently consume judgment-grade spend — the
discipline the $139 session forced, enforced at the gateway instead of per call.

```
start
  └─► conditional: task tier (from request metadata)
        ├─ gathering  ──► cheap model      (extraction, classification, lookup)
        └─ judgment   ──► strong model     (tax reasoning, review, final synthesis)
              each leg ─► rate element ─► success | fallback ─► alternate provider
```

- **rate element:** `limitType: cost` where the spend ceiling matters more than call
  count; count-based on the cheap leg.
- **fallback:** every leg terminates in a fallback rather than an error, so a provider
  outage degrades instead of failing the books workflow.
- Route config is versioned and deployed through the routes API (`/routes`,
  `/routes/{id}/versions`, `/routes/{id}/deployments`), so changes are reviewable and
  revertible rather than edited in place.

Model names change; the route must be treated as config that drifts, and checked when
models are retired.

## 4. Build order

1. Create the `finance` namespace and the instance bound to the `finance` gateway.
2. Load internal canon first — smallest, highest value, and it exercises the pipeline
   before large PDFs are spent on.
3. Load federal tax authority, then Illinois/Chicago/Cook, then Wyoming, then
   Florida/Colombia.
4. Verify retrieval with fixed questions whose answers are known from
   `docs/CHART-OF-ACCOUNTS.md` (Form 8825 line for wages; whether a 30-day let is
   passive; Chicago deposit segregation) before anything depends on it.
5. Create the dynamic route, deploy a version, and confirm traffic is tiered in the
   gateway logs.

## 5. Constraints

- Infrastructure creation routes through ChittyConnect; no credential value appears in
  code, chat or this document.
- Copyrighted commentary is not uploaded. Primary sources and internal documents only.
- Retrieval is evidence, never authority: an answer that affects a filing cites the
  form or statute, and the LITC/CPA reviews it. Nothing here is tax advice.

## 6. Build notes (verified 2026-09-17)

Namespace `finance`, instance `finance-reference`, bound to the `finance` gateway.
`default` and `legal-cases` untouched; the gateway's own settings unchanged.

**Four things the API requires that the spec above did not say:**

1. **`index_method: {vector: true, keyword: true}` must be set explicitly.** The default
   is vector-only, which leaves `fusion_method: "rrf"` with nothing to fuse — and the
   keyword leg is exactly what account-code and line-number lookups need.
2. **Metadata values must be sent as JSON strings** in the multipart part. A numeric
   `2026` is rejected (`7056 invalid_metadata_format`); `"2026"` is accepted and coerces
   correctly onto the number-typed field.
3. **`keyword_match_mode` defaults to `"and"`**, requiring every query term. Hybrid
   queries return nothing until it is set to `"or"`.
4. Defaults inherited: embedding `@cf/qwen/qwen3-embedding-0.6b`, `chunk_size` 1024,
   `score_threshold` 0.4, `max_num_results` 10, no public endpoint.

**Loaded:** 7 internal canon items, 32 chunks, 32 vectors at 1024 dimensions, indexing
completed with zero errors. Each item was hashed locally, downloaded back from the
instance and re-hashed — all matched.

**This manifest is deliberately NOT in the index.** It was loaded during the build and
removed: §2 lists the entire corpus, so it lexically matches almost any tax query and
took rank 1 over the real answer on a self-employment question. A build document is not
reference material.

**Verification queries** (hybrid, rrf, `keyword_match_mode: "or"`, cache off) all
returned the correct passage: the Form 8825 wages line, the mid-term/self-employment
answer, the transfer clearing treatment, and the COA 3200 remediation record.

**Known gaps going into the federal load:**

- `max_num_results: 1` is unsafe — the correct chunk placed second on one query. Retrieve
  several and let the caller judge.
- Two `source_url` values point at `/blob/main/` paths that 404 until PR #157 and this
  PR merge. Provenance is stable by design; the links resolve on merge.
- `doc_type` gained `record` for change records like the remediation SQL, which fitted
  none of the original seven values.
