# Property Portfolio Hub Design (v2)

**Date**: 2026-02-26
**Status**: Approved
**Scope**: Full dashboard redesign — property-centric portfolio with investor overview, manager operations, slide-out detail panels, and AI advisor via ChittyAgent

## Problem

ChittyFinance has a complete property management backend (20 route modules, 86 tests, 35+ endpoints, 5 valuation sources) but the frontend is largely stubs. The Dashboard (604 LOC) shows hardcoded KPIs, Properties.tsx is a basic list, and ValuationConsole is locked to one address. There's no cohesive portfolio experience.

## Decision

**Approach B: Full Dashboard Redesign** — Replace the current Dashboard with a property-centric landing page. Portfolio KPIs at top, property cards grid, two-tab layout (Overview + Operations), slide-out detail panels with expand-to-full-page option, and ChittyAgent-powered AI advisor.

## Routing

```
/                    → Portfolio Dashboard (replaces old Dashboard)
/properties/:id      → Property Detail (full page, same content as panel)
/valuation/:id       → ValuationConsole (standalone deep analysis)
/connections         → Connections (unchanged)
/settings            → Settings (unchanged)
/admin               → Admin/Forensics (unchanged)
```

**Removed**: `/valuation/550-w-surf-504` (hardcoded route)
**Removed**: Old Dashboard.tsx (replaced by PortfolioDashboard)

## Page Layout

```
┌─────────────────────────────────────────────────────┐
│  Portfolio KPIs (4-col grid)                        │
│  [Total Value] [Total NOI] [Avg Cap Rate] [Occup%] │
├─────────────────────────────────────────────────────┤
│  [Overview tab] [Operations tab]    [+ Add Property]│
├─────────────────────────────────────────────────────┤
│  Overview Tab:        │  Slide-out Panel (60% width)│
│  ┌────────┐ ┌────────┤  ┌──────────────────────────┤
│  │PropCard│ │PropCard│  │ [Summary][Units][Fin][Val]│
│  │ 1      │ │ 2     │  │ [AI Advisor]              │
│  └────────┘ └────────┤  │                           │
│  ┌────────┐          │  │  Property detail content  │
│  │PropCard│          │  │  with tabs                │
│  │ 3      │          │  │                           │
│  └────────┘          │  │  [⤢ Expand to full page]  │
│                      │  └──────────────────────────┘
└─────────────────────────────────────────────────────┘
```

## Components

### New Files
| File | Purpose |
|------|---------|
| `client/src/pages/PortfolioDashboard.tsx` | New primary landing page |
| `client/src/pages/PropertyDetailPage.tsx` | Full-page property detail |
| `client/src/components/property/PortfolioKPIs.tsx` | Top-strip metric cards |
| `client/src/components/property/PropertyCard.tsx` | Grid card component |
| `client/src/components/property/PropertyDetailPanel.tsx` | Slide-out Sheet |
| `client/src/components/property/OperationsTab.tsx` | Lease timeline + rent collection |
| `client/src/components/property/AddPropertyDialog.tsx` | Create property modal |
| `client/src/components/property/PropertySummaryTab.tsx` | Detail panel Summary tab |
| `client/src/components/property/UnitsLeasesTab.tsx` | Detail panel Units & Leases tab |
| `client/src/components/property/FinancialsTab.tsx` | Detail panel P&L + rent roll |
| `client/src/components/property/ValuationTab.tsx` | Detail panel valuation summary |
| `client/src/components/property/AIAdvisorTab.tsx` | ChittyAgent chat interface |
| `client/src/hooks/use-property.ts` | Query + mutation hooks |
| `server/routes/portfolio.ts` | New portfolio summary endpoint |

### Modified Files
| File | Change |
|------|--------|
| `client/src/App.tsx` | Update routes, remove hardcoded valuation |
| `client/src/pages/ValuationConsole.tsx` | Parameterize (accept property ID from URL) |
| `server/routes/ai.ts` | Add `/api/ai/property-advice` endpoint |
| `server/app.ts` | Wire portfolio and AI routes |

### Deleted Files
| File | Reason |
|------|--------|
| `client/src/pages/Dashboard.tsx` | Replaced by PortfolioDashboard |

## Portfolio KPIs

4-column responsive grid using `cf-metric` CSS pattern + framer-motion stagger.

| Card | Value | Source | Icon |
|------|-------|--------|------|
| Total Portfolio Value | Sum of currentValue | `/api/portfolio/summary` | `Building2` |
| Net Operating Income | Sum of NOI per property | `/api/portfolio/summary` | `DollarSign` |
| Avg Cap Rate | Weighted avg by property value | `/api/portfolio/summary` | `TrendingUp` |
| Portfolio Occupancy | Occupied / total units | `/api/portfolio/summary` | `Users` |

Delta indicators show change vs prior month (when available).

## Property Card Design

```
┌────────────────────────────────────┐
│ 🏠 City Studio            [condo] │  ← Name + type badge
│ 550 W Surf St, Chicago IL 60657   │  ← Full address, muted text
│────────────────────────────────────│
│  $350,000     $18,000    5.2%     │  ← Value / NOI / Cap Rate
│  Valuation    NOI        Cap Rate │
│────────────────────────────────────│
│  ██████████████░░ 100% occupied   │  ← Occupancy bar
│  1/1 units · C211 · $2,200/mo    │  ← Unit summary
│────────────────────────────────────│
│  Zillow + 2 sources · 3d ago     │  ← Valuation freshness
│  [View Details]  [Valuation →]    │  ← Hover-reveal actions
└────────────────────────────────────┘
```

**Visual states:**
- Default: `cf-raised` background, subtle border
- Hover: `cf-card-glow` border, action buttons fade in
- Selected: Blue left border accent (panel open for this property)
- Warning: Orange top border (lease expiring <90 days)
- Vacant: Red occupancy bar, pulsing dot (0% occupied)

Grid: 1-col mobile, 2-col md, 3-col lg. Sort dropdown: by value, cap rate, occupancy, name.
Empty state: "No properties yet" + "Add Property" CTA.

## Operations Tab

### Lease Expiration Timeline

Horizontal bars per lease, color-coded by urgency:
- Red: <30 days remaining
- Orange: 30-60 days
- Yellow: 60-90 days
- Green: >90 days

Clicking a bar opens the property detail panel.

### Rent Collection Table

| Property | Unit | Tenant | Expected | Collected | Status | Action |
|----------|------|--------|----------|-----------|--------|--------|
| City Studio | C211 | John Doe | $2,200 | $2,200 | Paid | — |
| Apt Arlene | 1610 | Sharon Jones | $1,800 | $0 | Overdue | Create Task |

Status badges: green Paid, yellow Pending, red Overdue, gray Vacant.
Monthly date picker. "Create Task" button → POST `/api/tasks`.

### Alert Thresholds
- Lease expiring <30 days → red badge on Operations tab label
- Rent overdue >5 days → red row highlight
- Vacancy >30 days → orange alert card at top

## Property Detail Panel

shadcn `Sheet` component, side="right", ~60% width on lg+, full-width on mobile.
Header has property name + [Edit] + [⤢ Expand] buttons.
Expand navigates to `/properties/:id` (full page with same tab structure).

### Tab 1: Summary
- Property name, address, type badge, active status
- 4 metric cards: Value, NOI, Cap Rate, Cash-on-Cash
- Purchase info: price, date, equity, appreciation

### Tab 2: Units & Leases
- Unit list with lease status per unit
- Add Unit button → Dialog form → POST `/api/properties/:id/units`
- Add Lease button → Dialog form → POST `/api/properties/:id/leases`
- Lease expiration warnings (⚠️ icon if <90 days)
- Edit inline with PATCH

### Tab 3: Financials
- Date range picker (defaults to current year)
- P&L breakdown: Income → Expenses → NOI
- Data from `/api/properties/:id/pnl?start=...&end=...`
- Rent roll table below P&L

### Tab 4: Valuation
- Weighted estimate + range
- Source breakdown with confidence scores and freshness
- "Refresh All Sources" → POST `/api/properties/:id/valuation/refresh`
- "Full Analysis →" navigates to `/valuation/:id` (standalone ValuationConsole)

### Tab 5: AI Advisor (via ChittyAgent)
- Chat interface with property financial context auto-injected
- Quick prompt buttons: [Optimize NOI] [Rent analysis] [Market comparison]
- Messages via POST `/api/ai/property-advice`
- Small attribution badge showing model provider

## AI Integration via ChittyAgent

### Architecture

```
Frontend Chat UI
  → POST /api/ai/property-advice { propertyId, message }
    → ChittyFinance Worker gathers property context
      (financials, valuations, leases from storage)
    → POST agent.chitty.cc/chat {
        context: { property, financials, valuations, leases },
        message,
        service: "chittyfinance"
      }
      → ChittyAgent selects model, routes request
      ← Response with citations
    ← JSON { role: "assistant", content: "...", model: "..." }
  ← Rendered in chat panel
```

### Why ChittyAgent (not direct OpenAI)
- Centralized model routing (GPT-4o, Llama via CFAI Workers, Claude)
- Shared context across ChittyOS services (MemoryCloude)
- Credential management through ChittyConnect
- Future: dynamic model selection by query complexity

### Graceful Degradation
If ChittyAgent unavailable, falls back to direct OpenAI (existing `server/lib/openai.ts`) if `OPENAI_API_KEY` is set. If neither available, returns a rule-based response.

### Environment Variables
```bash
CHITTYAGENT_API_BASE="https://agent.chitty.cc"
CHITTYAGENT_API_TOKEN="..."
```

## New Backend Endpoint

### GET /api/portfolio/summary

Returns aggregated portfolio metrics in one call (avoids N+1):

```json
{
  "totalProperties": 2,
  "totalValue": 700000,
  "totalNOI": 36000,
  "avgCapRate": 5.15,
  "totalUnits": 3,
  "occupiedUnits": 2,
  "occupancyRate": 66.7,
  "leaseExpirations": {
    "within30": 0,
    "within60": 1,
    "within90": 1
  },
  "properties": [
    {
      "id": "...", "name": "City Studio", "address": "550 W Surf St",
      "currentValue": 350000, "noi": 18000, "capRate": 5.2,
      "occupancyRate": 100, "totalUnits": 1, "occupiedUnits": 1,
      "valuationSources": 3, "lastValuationAt": "2026-02-23T..."
    }
  ]
}
```

### POST /api/ai/property-advice

```json
// Request
{ "propertyId": "...", "message": "Should I raise rent?" }

// Response
{
  "role": "assistant",
  "content": "Based on your property's cap rate of 5.2%...",
  "model": "gpt-4o",
  "provider": "chittyagent"
}
```

## Data Hooks

```typescript
// Queries (client/src/hooks/use-property.ts)
usePortfolioSummary(tenantId)        // GET /api/portfolio/summary
useProperties(tenantId)               // GET /api/properties
useProperty(id)                       // GET /api/properties/:id
usePropertyFinancials(id)             // GET /api/properties/:id/financials
usePropertyRentRoll(id)               // GET /api/properties/:id/rent-roll
usePropertyPnL(id, start, end)        // GET /api/properties/:id/pnl
usePropertyValuation(id)              // GET /api/properties/:id/valuation
usePropertyValuationHistory(id)       // GET /api/properties/:id/valuation/history

// Mutations
useCreateProperty()                   // POST /api/properties
useUpdateProperty(id)                 // PATCH /api/properties/:id
useCreateUnit(propertyId)             // POST /api/properties/:id/units
useUpdateUnit(propertyId, unitId)     // PATCH /api/properties/:id/units/:unitId
useCreateLease(propertyId)            // POST /api/properties/:id/leases
useUpdateLease(propertyId, id)        // PATCH /api/properties/:id/leases/:leaseId
useSendPropertyAdvice(propertyId)     // POST /api/ai/property-advice
```

## Query Strategy

1. **Portfolio page load**: Single query to `/api/portfolio/summary` (staleTime: 5min)
2. **Panel open**: 4 parallel queries (property, financials, units/leases, valuations) (staleTime: 1min)
3. **Operations tab**: Lazy-loaded on tab select
4. **AI tab**: No prefetch — messages sent on user action
5. **Invalidation**: Mutations invalidate relevant query keys via TanStack Query

## Technical Decisions

- **Styling**: `cf-*` theme variables + shadcn/ui. No inline styles
- **Charts**: shadcn chart.tsx (recharts) for P&L bars
- **Animation**: framer-motion stagger + fadeUp (matching existing pattern)
- **Icons**: lucide-react (consistent with codebase)
- **State**: TanStack Query for server state, localStorage for valuation overrides only
- **Tenant awareness**: All queries use `useTenantId()` with `enabled` flag
- **Dark mode**: Full support via CSS custom properties

## Phased AI Roadmap

| Phase | Scope | Status |
|-------|-------|--------|
| Phase 1 (this design) | Property-specific AI advisor chat in detail panel | Planned |
| Phase 2 | Portfolio-wide AI insights on dashboard ("weakest property", "rebalance") | Future |
| Phase 3 | Background AI enrichment (auto-categorize, predict rent, detect anomalies) | Future |

## Out of Scope

- Property photo/document upload
- Maintenance request tracking (Phase 4 backlog)
- Tenant entity management (beyond lease contact info)
- Cash flow projections / forecasting
- Multi-currency support
- PDF export of reports
- Mobile app (Phase 6)
