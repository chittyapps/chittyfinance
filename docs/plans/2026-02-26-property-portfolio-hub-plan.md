# Property Portfolio Hub Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the hardcoded Dashboard with a property-centric portfolio landing page featuring slide-out detail panels, server-side portfolio aggregation, and an AI advisor via ChittyAgent.

**Architecture:** Evolve the existing `Properties.tsx` page into the primary landing page at `/`. Add a shadcn Sheet slide-out for property details (reusing existing tab components). New backend endpoint aggregates portfolio metrics server-side. AI advisor communicates through ChittyAgent with OpenAI fallback.

**Tech Stack:** React 18, Hono (Cloudflare Workers), TanStack Query, shadcn/ui (Sheet, Tabs, Dialog), Drizzle ORM, framer-motion, wouter

---

## Existing Code Inventory

Before starting, understand what already exists and will be reused:

| File | LOC | Status | Notes |
|------|-----|--------|-------|
| `client/src/pages/Properties.tsx` | 116 | **Evolve into PortfolioDashboard** | Has KPIs, tabs, cards grid, sort, empty state |
| `client/src/components/property/PortfolioSummary.tsx` | 60 | **Replace with server-side data** | Client-side aggregation → hook |
| `client/src/components/property/PropertyCard.tsx` | 89 | **Enhance** | Add selected state, valuation freshness, hover actions |
| `client/src/components/property/OpsView.tsx` | 121 | **Keep as-is** | Rent collection + lease expirations already done |
| `client/src/pages/PropertyDetail.tsx` | 181 | **Keep for full-page** | Already has Overview/RentRoll/P&L/Valuation tabs |
| `client/src/components/property/RentRollTable.tsx` | 67 | **Reuse in panel** | Single-property rent roll |
| `client/src/components/property/PnLReport.tsx` | 93 | **Reuse in panel** | P&L with date range picker |
| `client/src/components/property/ValuationTab.tsx` | 186 | **Reuse in panel** | Full valuation console |
| `client/src/pages/Dashboard.tsx` | 604 | **DELETE** | Hardcoded role-based dashboards |
| `client/src/hooks/use-property.ts` | 205 | **Add 2 hooks** | Already has 9 query + 4 mutation hooks |
| `server/app.ts` | 119 | **Wire new route** | Add portfolio prefix |
| `server/routes/ai.ts` | 35 | **Add endpoint** | Currently only ai-messages CRUD |

---

### Task 1: Backend — Portfolio Summary Endpoint

**Files:**
- Create: `server/routes/portfolio.ts`
- Modify: `server/app.ts:81-89` (add protected prefix + mount)
- Test: `server/__tests__/portfolio.test.ts`

**Step 1: Write the failing test**

Create `server/__tests__/portfolio.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function makeApp(storage: any) {
  // Same pattern as existing route tests — mock createDb, import createApp
  vi.doMock('../db/connection', () => ({ createDb: () => ({}) }));
  vi.doMock('../storage/system', () => ({
    SystemStorage: vi.fn().mockImplementation(() => storage),
  }));
}

describe('GET /api/portfolio/summary', () => {
  it('returns aggregated portfolio metrics', async () => {
    const mockStorage = {
      getProperties: vi.fn().mockResolvedValue([
        { id: '1', name: 'City Studio', address: '550 W Surf St', city: 'Chicago', state: 'IL', zip: '60657', propertyType: 'condo', currentValue: '350000', isActive: true },
        { id: '2', name: 'Apt Arlene', address: '4343 N Clarendon', city: 'Chicago', state: 'IL', zip: '60613', propertyType: 'apartment', currentValue: '350000', isActive: true },
      ]),
      getPropertyFinancials: vi.fn()
        .mockResolvedValueOnce({ noi: 18000, capRate: 5.2, totalUnits: 1, occupiedUnits: 1 })
        .mockResolvedValueOnce({ noi: 18000, capRate: 5.1, totalUnits: 2, occupiedUnits: 1 }),
      getLeases: vi.fn().mockResolvedValue([]),
    };
    makeApp(mockStorage);
    const { createApp } = await import('../app');
    const app = createApp();

    const res = await app.request('/api/portfolio/summary', {
      headers: { 'Authorization': 'Bearer test', 'X-Tenant-ID': TENANT },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalProperties).toBe(2);
    expect(body.totalValue).toBe(700000);
    expect(body.totalNOI).toBe(36000);
    expect(body.totalUnits).toBe(3);
    expect(body.occupiedUnits).toBe(2);
    expect(typeof body.avgCapRate).toBe('number');
    expect(typeof body.occupancyRate).toBe('number');
    expect(body.properties).toHaveLength(2);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/portfolio.test.ts`
Expected: FAIL — module not found or 404

**Step 3: Implement the portfolio route**

Create `server/routes/portfolio.ts`:

```typescript
import { Hono } from 'hono';
import type { HonoEnv } from '../env';

export const portfolioRoutes = new Hono<HonoEnv>();

portfolioRoutes.get('/api/portfolio/summary', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');

  const properties = await storage.getProperties(tenantId);
  const active = properties.filter((p: any) => p.isActive);

  let totalValue = 0;
  let totalNOI = 0;
  let totalUnits = 0;
  let occupiedUnits = 0;
  let capWeightedSum = 0;

  const propertyDetails = await Promise.all(
    active.map(async (p: any) => {
      const val = parseFloat(p.currentValue || '0');
      totalValue += val;

      let financials: any = null;
      try {
        financials = await storage.getPropertyFinancials(p.id);
      } catch {}

      if (financials) {
        totalNOI += financials.noi || 0;
        totalUnits += financials.totalUnits || 0;
        occupiedUnits += financials.occupiedUnits || 0;
        capWeightedSum += (financials.capRate || 0) * val;
      }

      return {
        id: p.id,
        name: p.name,
        address: p.address,
        city: p.city,
        state: p.state,
        propertyType: p.propertyType,
        currentValue: val,
        noi: financials?.noi || 0,
        capRate: financials?.capRate || 0,
        occupancyRate: financials
          ? (financials.totalUnits > 0 ? (financials.occupiedUnits / financials.totalUnits) * 100 : 0)
          : 0,
        totalUnits: financials?.totalUnits || 0,
        occupiedUnits: financials?.occupiedUnits || 0,
      };
    })
  );

  const avgCapRate = totalValue > 0 ? capWeightedSum / totalValue : 0;
  const occupancyRate = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;

  return c.json({
    totalProperties: active.length,
    totalValue,
    totalNOI,
    avgCapRate,
    totalUnits,
    occupiedUnits,
    occupancyRate,
    properties: propertyDetails,
  });
});
```

**Step 4: Wire the route in app.ts**

In `server/app.ts`:
- Add import: `import { portfolioRoutes } from './routes/portfolio';`
- Add `'/api/portfolio'` to `protectedPrefixes` array (line 82)
- Add `app.route('/', portfolioRoutes);` after the other route mounts (~line 107)

**Step 5: Run test to verify it passes**

Run: `npx vitest run server/__tests__/portfolio.test.ts`
Expected: PASS

**Step 6: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (86+)

**Step 7: Commit**

```bash
git add server/routes/portfolio.ts server/__tests__/portfolio.test.ts server/app.ts
git commit -m "feat: add GET /api/portfolio/summary endpoint for aggregated metrics"
```

---

### Task 2: Backend — AI Property Advice Endpoint

**Files:**
- Modify: `server/routes/ai.ts`
- Test: `server/__tests__/ai-advice.test.ts`

**Step 1: Write the failing test**

Create `server/__tests__/ai-advice.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PROP_ID = '11111111-1111-1111-1111-111111111111';

describe('POST /api/ai/property-advice', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns 400 if propertyId or message missing', async () => {
    vi.doMock('../db/connection', () => ({ createDb: () => ({}) }));
    vi.doMock('../storage/system', () => ({
      SystemStorage: vi.fn().mockImplementation(() => ({})),
    }));
    const { createApp } = await import('../app');
    const app = createApp();

    const res = await app.request('/api/ai/property-advice', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer test',
        'X-Tenant-ID': TENANT,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('returns rule-based fallback when no AI configured', async () => {
    const storage = {
      getProperty: vi.fn().mockResolvedValue({
        id: PROP_ID, name: 'City Studio', address: '550 W Surf St',
        propertyType: 'condo', currentValue: '350000',
      }),
      getPropertyFinancials: vi.fn().mockResolvedValue({
        noi: 18000, capRate: 5.2, totalUnits: 1, occupiedUnits: 1,
      }),
    };
    vi.doMock('../db/connection', () => ({ createDb: () => ({}) }));
    vi.doMock('../storage/system', () => ({
      SystemStorage: vi.fn().mockImplementation(() => storage),
    }));
    const { createApp } = await import('../app');
    const app = createApp();

    const res = await app.request('/api/ai/property-advice', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer test',
        'X-Tenant-ID': TENANT,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ propertyId: PROP_ID, message: 'Should I raise rent?' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.role).toBe('assistant');
    expect(body.provider).toBe('rule-based');
    expect(body.content).toContain('City Studio');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/ai-advice.test.ts`
Expected: FAIL — endpoint returns 404

**Step 3: Add the endpoint to ai.ts**

Append to `server/routes/ai.ts` (after the existing `POST /api/ai-messages` handler):

```typescript
// POST /api/ai/property-advice — AI advisor for a specific property
aiRoutes.post('/api/ai/property-advice', async (c) => {
  const storage = c.get('storage');
  const body = await c.req.json();
  const { propertyId, message } = body;

  if (!propertyId || !message) {
    return c.json({ error: 'propertyId and message are required' }, 400);
  }

  // Gather property context
  let property: any, financials: any;
  try {
    property = await storage.getProperty(propertyId);
    financials = await storage.getPropertyFinancials(propertyId);
  } catch {}

  if (!property) {
    return c.json({ error: 'Property not found' }, 404);
  }

  const context = {
    property: { name: property.name, address: property.address, type: property.propertyType, currentValue: property.currentValue },
    financials: financials || null,
  };

  // Try ChittyAgent first
  const agentBase = c.env.CHITTYAGENT_API_BASE;
  const agentToken = c.env.CHITTYAGENT_API_TOKEN;

  if (agentBase && agentToken) {
    try {
      const agentRes = await fetch(`${agentBase}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${agentToken}` },
        body: JSON.stringify({ context, message, service: 'chittyfinance' }),
      });
      if (agentRes.ok) {
        const data = await agentRes.json() as any;
        return c.json({ role: 'assistant', content: data.content || data.message, model: data.model, provider: 'chittyagent' });
      }
    } catch {}
  }

  // Fallback: rule-based response
  const capRateInfo = financials?.capRate ? `Your property has a cap rate of ${financials.capRate.toFixed(1)}%.` : '';
  const noiInfo = financials?.noi ? `Current NOI is $${financials.noi.toLocaleString()}.` : '';
  return c.json({
    role: 'assistant',
    content: `Based on the data for ${property.name}: ${capRateInfo} ${noiInfo} For detailed analysis, please configure ChittyAgent or OpenAI.`,
    model: null,
    provider: 'rule-based',
  });
});
```

Also add `'/api/ai'` to `protectedPrefixes` in `server/app.ts` (currently only `/api/ai-messages` is protected — adding `/api/ai` will cover both).

**Step 4: Run test to verify it passes**

Run: `npx vitest run server/__tests__/ai-advice.test.ts`
Expected: PASS

**Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

**Step 6: Commit**

```bash
git add server/routes/ai.ts server/__tests__/ai-advice.test.ts server/app.ts
git commit -m "feat: add POST /api/ai/property-advice with ChittyAgent + rule-based fallback"
```

---

### Task 3: Frontend Hooks — Portfolio Summary + AI Advice

**Files:**
- Modify: `client/src/hooks/use-property.ts`

**Step 1: Add PortfolioSummary type and hook**

Add to `client/src/hooks/use-property.ts` after the existing types (~line 93):

```typescript
export interface PortfolioSummaryData {
  totalProperties: number;
  totalValue: number;
  totalNOI: number;
  avgCapRate: number;
  totalUnits: number;
  occupiedUnits: number;
  occupancyRate: number;
  properties: Array<{
    id: string;
    name: string;
    address: string;
    city: string;
    state: string;
    propertyType: string;
    currentValue: number;
    noi: number;
    capRate: number;
    occupancyRate: number;
    totalUnits: number;
    occupiedUnits: number;
  }>;
}

export interface AIAdviceResponse {
  role: string;
  content: string;
  model: string | null;
  provider: string;
}
```

Add new hooks after existing query hooks (~line 158):

```typescript
export function usePortfolioSummary() {
  const tenantId = useTenantId();
  return useQuery<PortfolioSummaryData>({
    queryKey: ['/api/portfolio/summary', tenantId],
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSendPropertyAdvice(propertyId: string) {
  return useMutation({
    mutationFn: (message: string) =>
      apiRequest('POST', '/api/ai/property-advice', { propertyId, message }).then(r => r.json()),
  });
}
```

**Step 2: Verify types compile**

Run: `npm run check`
Expected: No new errors

**Step 3: Commit**

```bash
git add client/src/hooks/use-property.ts
git commit -m "feat: add usePortfolioSummary and useSendPropertyAdvice hooks"
```

---

### Task 4: Frontend — Property Detail Panel (Slide-out Sheet)

This is the core new UI component. It reuses all existing tab components inside a shadcn Sheet.

**Files:**
- Create: `client/src/components/property/PropertyDetailPanel.tsx`

**Step 1: Create the slide-out panel component**

Create `client/src/components/property/PropertyDetailPanel.tsx`:

The component uses shadcn `Sheet` (side="right", ~60% width) with:
- Header: property name, address, type badge, expand button
- KPI mini-cards: NOI, Cap Rate, Cash-on-Cash, Occupancy
- 5 tabs: Summary, Rent Roll, P&L, Valuation, AI Advisor
- Summary tab shows property details + purchase info
- Other tabs reuse existing components: `RentRollTable`, `PnLReport`, `ValuationTab`
- AI tab is a placeholder until Task 5

Key imports:
```typescript
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProperty, usePropertyFinancials } from '@/hooks/use-property';
import RentRollTable from './RentRollTable';
import PnLReport from './PnLReport';
import ValuationTab from './ValuationTab';
```

Props interface:
```typescript
interface Props {
  propertyId: string | null;
  open: boolean;
  onClose: () => void;
}
```

The expand button navigates to `/properties/:id` (full page, same as `PropertyDetail.tsx`).

**Step 2: Verify types compile**

Run: `npm run check`
Expected: No new errors

**Step 3: Commit**

```bash
git add client/src/components/property/PropertyDetailPanel.tsx
git commit -m "feat: add PropertyDetailPanel slide-out Sheet component"
```

---

### Task 5: Frontend — AI Advisor Tab

**Files:**
- Create: `client/src/components/property/AIAdvisorTab.tsx`
- Modify: `client/src/components/property/PropertyDetailPanel.tsx` (replace placeholder)

**Step 1: Create the AI Advisor tab component**

Create `client/src/components/property/AIAdvisorTab.tsx` with:
- Local `messages` state (array of `{ role, content, provider, model }`)
- Quick prompt buttons: "Optimize NOI", "Rent analysis", "Market comparison"
- Chat message list with user/assistant bubbles
- Input form at bottom with send button
- Provider/model attribution badge on assistant messages
- Loading state ("Thinking...")
- Uses `useSendPropertyAdvice(propertyId)` mutation hook

**Step 2: Wire into PropertyDetailPanel**

In `client/src/components/property/PropertyDetailPanel.tsx`:
- Add import: `import AIAdvisorTab from './AIAdvisorTab';`
- Replace the AI tab placeholder with: `<AIAdvisorTab propertyId={property.id} />`

**Step 3: Verify types compile**

Run: `npm run check`
Expected: No new errors

**Step 4: Commit**

```bash
git add client/src/components/property/AIAdvisorTab.tsx client/src/components/property/PropertyDetailPanel.tsx
git commit -m "feat: add AI Advisor tab with ChittyAgent chat interface"
```

---

### Task 6: Frontend — Add Property Dialog

**Files:**
- Create: `client/src/components/property/AddPropertyDialog.tsx`

**Step 1: Create the dialog component**

Create `client/src/components/property/AddPropertyDialog.tsx` with:
- shadcn `Dialog` with trigger button (Plus icon + "Add Property")
- Form fields: name, type (select), address, city, state, zip, purchase price, current value
- Type options: condo, apartment, single_family, multi_family, commercial, mixed_use
- Uses `useCreateProperty()` mutation
- Closes dialog and resets form on success
- Disables submit while pending or if name/address empty

**Step 2: Verify types compile**

Run: `npm run check`
Expected: No new errors

**Step 3: Commit**

```bash
git add client/src/components/property/AddPropertyDialog.tsx
git commit -m "feat: add AddPropertyDialog with form validation"
```

---

### Task 7: Frontend — Evolve Properties into PortfolioDashboard

This is the integration task. Create `PortfolioDashboard.tsx` (evolved from Properties.tsx), wire the Sheet panel, switch to server-side portfolio summary, update routes.

**Files:**
- Create: `client/src/pages/PortfolioDashboard.tsx` (evolved from Properties.tsx)
- Modify: `client/src/components/property/PropertyCard.tsx` (add selected/onSelect props)
- Modify: `client/src/App.tsx` (update routes, remove Dashboard import)
- Modify: `client/src/components/layout/Sidebar.tsx` (update nav)
- Delete: `client/src/pages/Dashboard.tsx`
- Delete: `client/src/pages/Properties.tsx` (replaced by PortfolioDashboard)

**Step 1: Create PortfolioDashboard**

Create `client/src/pages/PortfolioDashboard.tsx` — this is `Properties.tsx` evolved with:
- `usePortfolioSummary()` replacing client-side aggregation in `PortfolioSummary.tsx`
- KPI strip using `cf-metric` + `cf-card-glow` CSS classes (matching Dashboard.tsx pattern)
- framer-motion `stagger` + `fadeUp` animation variants
- `PropertyDetailPanel` slide-out opens on card click (instead of navigate)
- `AddPropertyDialog` replacing the stub button
- Selected card state tracking via `selectedPropertyId`
- Same tabs: Overview + Operations
- Same sort dropdown: value, name

Key difference from `Properties.tsx`:
- PropertyCard click → `setSelectedPropertyId(id)` (opens panel) instead of `navigate(/properties/:id)`
- KPIs come from `usePortfolioSummary()` server-side data instead of client-side `PortfolioSummary` component
- Uses `cf-*` CSS variables for consistent ChittyFinance theming
- framer-motion stagger on the card grid

**Step 2: Update PropertyCard to support selected state and onSelect callback**

In `client/src/components/property/PropertyCard.tsx`:
- Add to Props: `selected?: boolean; onSelect?: () => void;`
- On card click: call `onSelect?.()` if provided, else `navigate()`
- Add conditional class: `selected && 'border-l-4 border-l-blue-500'`
- Keep "View Details" button always navigating to `/properties/:id` (full page)

**Step 3: Update App.tsx routes**

In `client/src/App.tsx`:
- Replace `import Dashboard from "@/pages/Dashboard"` with `import PortfolioDashboard from "@/pages/PortfolioDashboard"`
- Remove `import Properties from "@/pages/Properties"`
- Change `<Route path="/" component={Dashboard} />` to `<Route path="/" component={PortfolioDashboard} />`
- Remove `<Route path="/properties" component={Properties} />`

**Step 4: Update Sidebar navigation**

In `client/src/components/layout/Sidebar.tsx`:
- Remove the "Properties" nav item with `href: "/properties"` since portfolio is now at `/`
- The "Overview" item at `/` now serves as the portfolio landing page

**Step 5: Delete old files**

- Delete `client/src/pages/Dashboard.tsx` (604 LOC of hardcoded data)
- Delete `client/src/pages/Properties.tsx` (replaced by PortfolioDashboard)

**Step 6: Verify everything compiles**

Run: `npm run check`
Expected: No errors

**Step 7: Build frontend**

Run: `npx vite build --outDir dist/public`
Expected: Build succeeds

**Step 8: Commit**

```bash
git add client/src/pages/PortfolioDashboard.tsx client/src/components/property/PropertyCard.tsx client/src/App.tsx client/src/components/layout/Sidebar.tsx
git rm client/src/pages/Dashboard.tsx client/src/pages/Properties.tsx
git commit -m "feat: replace Dashboard with PortfolioDashboard — property-centric landing page with slide-out panels"
```

---

### Task 8: Deploy, Verify, Final Commit

**Files:** None new — deployment and verification

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

**Step 2: Build and deploy**

```bash
npx vite build --outDir dist/public
npx wrangler deploy --config deploy/system-wrangler.toml
```

**Step 3: Verify production**

```bash
curl -s https://finance.chitty.cc/health | jq .status
# Expected: "ok"

curl -s https://finance.chitty.cc/api/portfolio/summary \
  -H "Authorization: Bearer test" \
  -H "X-Tenant-ID: test"
# Expected: 401 or proper response (auth rejection is fine — endpoint exists)
```

**Step 4: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "chore: deploy Property Portfolio Hub to production"
```

---

## Task Dependency Graph

```
Task 1 (portfolio endpoint)
  ↓
Task 2 (AI endpoint)     Task 3 (hooks) ← depends on Task 1
  ↓                        ↓
Task 5 (AI tab)          Task 4 (detail panel)
  ↓                        ↓
Task 6 (add dialog)        ↓
  ↓                        ↓
  └──────→ Task 7 (PortfolioDashboard integration) ←──────┘
             ↓
           Task 8 (deploy + verify)
```

Tasks 1 and 2 can run in parallel. Tasks 4, 5, and 6 can run in parallel after Task 3.

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Sheet z-index conflicts with Sidebar | shadcn Sheet uses portals — should be fine; test mobile overlay |
| N+1 queries in portfolio summary | Single endpoint aggregates server-side |
| ChittyAgent unavailable | Rule-based fallback returns useful response |
| framer-motion bundle size | Already in the project (Dashboard.tsx uses it) |
| PropertyCard `onSelect` breaking existing uses | PropertyCard keeps backward-compatible — `onSelect` is optional |
