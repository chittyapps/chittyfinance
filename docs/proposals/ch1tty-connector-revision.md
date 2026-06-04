# ch1tty Mercury/ChittyBooks connector — revision

> Revises the canonical draft `CHITTYOS/chittycommand/docs/plans/2026-02-23-mercury-chittybooks-plan.md` to route through real services or gate fake endpoints. Companion to the contracts in `docs/contracts/`.

## Fake / dead endpoints in the current draft

| Reference | Location | Status today | Action |
|---|---|---|---|
| `CHITTYBOOKS_URL = "https://books.chitty.cc"` | `chittycommand/docs/plans/2026-02-23-mercury-chittybooks-plan.md:168` | DNS does not resolve | **Disable behind deploy gate** until ChittyBooks deploy decision lands (see `docs/contracts/chittybooks-chittyfinance.md`). |
| `booksClient(env)` | `chittycommand/src/lib/integrations.ts:618` | Implemented; target URL does not resolve | Wrap in env guard: if `CHITTYBOOKS_URL` is unset or `*.chitty.cc` DNS-lookup fails on cold-start, return `null` like `financeClient` does on missing config. Add log line `[books] disabled — no CHITTYBOOKS_URL`. |
| Service-list expectation that `chittybooks` is in registry response | `chittycommand/docs/plans/2026-02-23-mercury-chittybooks-plan.md:934` | Registry will not return chittybooks because nothing is registered | Remove `chittybooks` from the "expected services" assertion until it deploys. |

## Real services to route through (use these, not stubs)

| Concern | Existing real service | Path |
|---|---|---|
| Mercury read | Direct Mercury API per-tenant token | `https://api.mercury.com/api/v1` via `mercuryClient(token)` in `chittycommand/src/lib/integrations.ts:551` |
| Mercury write | mercury-proxy on chittyserv-dev | `https://mercury-proxy.chitty.cc` (CF tunnel) — POST `/proxy` with `X-Mercury-Token` |
| Mercury webhooks | ChittyFinance | `POST https://finance.chitty.cc/api/webhooks/mercury` (PR #113, per-business HMAC secrets) |
| Bookkeeping reads | ChittyFinance | `GET https://finance.chitty.cc/api/transactions` and `/api/reports/*` |
| Bookkeeping writes | ChittyFinance | `POST https://finance.chitty.cc/api/transactions`, `/api/allocations`, `/api/classification` — **not** a separate `chittybooks` write API |
| Credentials | ChittyConnect | `https://connect.chitty.cc` via concierge — never chat-paste |
| Ledger writes | ChittyLedger | `POST https://ledger.chitty.cc/api/entries` (auth-required; matches ChittyFinance's `server/lib/ledger-client.ts` which posts to `${base}/api/entries`) |

## Concrete revisions to the canonical plan

Apply these to `CHITTYOS/chittycommand/docs/plans/2026-02-23-mercury-chittybooks-plan.md` in a follow-up PR on that repo:

1. **Replace** `CHITTYBOOKS_URL = "https://books.chitty.cc"` with `CHITTYBOOKS_URL = ""` and add note: "ChittyBooks is a UI-layer surface, not a separate API. For bookkeeping reads/writes, target ChittyFinance (`https://finance.chitty.cc/api/*`)."
2. **Mark `booksClient` deprecated** in `chittycommand/src/lib/integrations.ts` until/unless ChittyBooks deploys as its own service. Comment: `// @deprecated: books.chitty.cc does not resolve. Use financeClient for bookkeeping.`
3. **Remove the registry-expectation assertion** for `chittybooks` (or change to "optional, present only if deployed").
4. **Add deploy gate** at the top of the plan: "This plan assumes ChittyBooks is a deployed bookkeeping API. As of 2026-05-27 that is false. Do not implement task 3+ until the deploy decision in `chittyfinance/docs/contracts/chittybooks-chittyfinance.md` lands."

## Deploy gates

- [ ] PR against `CHITTYOS/chittycommand` to make `booksClient` lazy + null-returning when target is unset.
- [ ] No new caller of `booksClient` lands until ChittyBooks deploy choice is made.
- [ ] Mercury reads keep routing through `mercuryClient` (real); writes through `mercury-proxy` (real).
