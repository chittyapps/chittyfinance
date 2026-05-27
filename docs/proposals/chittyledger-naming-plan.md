# ChittyLedger naming collision — substrate + projections plan

> Resolves the `CHITTYFOUNDATION/chittyledger` vs `CHITTYOS/chittyledger` collision. Aligns with the substrate/projection model in `docs/chittyledger-finance-design.md`.

## Current state (verified 2026-05-27)

| Repo | Description | Deploy | Role |
|---|---|---|---|
| `CHITTYFOUNDATION/chittyledger` | Worker at `ledger.chitty.cc`. Has CHARTER/CHITTY/CLAUDE pentad. Endpoints: `POST /entries`, `GET /custody/:entityId`, `GET /verify`. | ✅ `200 ok` at `ledger.chitty.cc/health` | **Canonical substrate.** |
| `CHITTYOS/chittyledger` | "ChittyChain Evidence Ledger" — Express + React + Drizzle, in-memory storage, evidence/legal UI. No deploy. Last touched 2026-03-25. | none | Legacy fork. Functionally an evidence UI app, not a ledger. |
| `CHITTYOS/chittychronicle/chittyledger` | Nested submodule/copy. | n/a | Noise. |
| `CHITTYFOUNDATION/chittyscore/chittyfinance` | Nested submodule/copy. | n/a | Noise. |

## Target model

```
ChittyLedger (substrate)        — CHITTYFOUNDATION/chittyledger    — ledger.chitty.cc
├── ChittyLedger-Finance        — projection (tables in substrate DB; surface via ChittyFinance)
│       schema doc:               docs/chittyledger-finance-design.md (already canon)
│       writer:                   ChittyFinance via /entries
│       reader:                   ChittyFinance, ChittyBooks (read-only via ChittyFinance aggregators)
└── ChittyLedger-Evidence       — projection (tables in substrate DB; surface via ChittyEvidence)
        writer:                   ChittyTrace + ChittyEvidence via /entries
        reader:                   ChittyCases, ChittyResolution
```

Projections are **views over the substrate**, not separate ledgers. They MUST NOT have separate hash chains.

## Plan

1. **Rename `CHITTYOS/chittyledger` → `CHITTYOS/chittyledger-evidence-legacy`** and add a top-of-README banner: "Legacy evidence-UI fork. Not the canonical ChittyLedger. See `CHITTYFOUNDATION/chittyledger` for the substrate." This preserves git history while removing the naming collision.
2. **Archive** the renamed repo if no active work depends on it. Otherwise port its UI components into `CHITTYAPPS/chittyevidence` (which is the active evidence service).
3. **Delete or vendor the nested `chittychronicle/chittyledger` and `chittyscore/chittyfinance`** — these are working-tree noise from prior submodule experiments. They are not canon.
4. **Add a top-of-README disambiguation banner to `CHITTYFOUNDATION/chittyledger`**: "ChittyLedger is the substrate. ChittyLedger-Finance and ChittyLedger-Evidence are projections defined in their respective service repos; they are not separate deployables."
5. **Add a `ChittyLedger-Finance` section to `CHITTYAPPS/chittyfinance/CHITTY.md`** that says: "ChittyFinance hosts the ChittyLedger-Finance projection. The schema is defined in `docs/chittyledger-finance-design.md`. The projection's writer is ChittyFinance; its substrate is `ledger.chitty.cc`."
6. **Canon URI alignment** — confirm `chittycanon://core/services/chitty-ledger` resolves to the substrate, not the legacy fork. Update ChittyRegister if it points at the wrong repo.

## Deploy gates

- [ ] Repo rename requires org-owner approval (`gh repo rename` on CHITTYOS/chittyledger).
- [ ] No DNS or Worker changes — `ledger.chitty.cc` stays where it is. This plan is paper-only.
- [ ] Canon URI update in ChittyRegister needs schema-overlord review.
