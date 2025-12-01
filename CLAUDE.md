# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **🎯 Project Orchestration:** This project follows [ChittyCan™ Project Standards](../CHITTYCAN_PROJECT_ORCHESTRATOR.md)

## Project Overview

**ChittyFinance** is a full-stack financial management platform for the ChittyOS ecosystem. It provides intelligent financial tracking, AI-powered advice, recurring charge optimization, and integrations with Mercury Bank, Wave Accounting, and Stripe payments.

**Architecture**: Single PostgreSQL database (Neon) with Express backend and React frontend.

## Essential Commands

### Development
```bash
npm install              # Install dependencies
npm run dev              # Auto-detect mode and start dev server on port 5000
npm run dev:standalone   # Start in standalone mode (local development)
npm run dev:system       # Start in system mode (ChittyOS integration)
npm run check            # TypeScript type checking
npm run mode:detect      # Detect and display current mode
npm run mode:setup       # Setup mode configuration (script not yet implemented)
```

### Build & Deployment
```bash
npm run build            # Build system mode (default for production)
npm run build:standalone # Build standalone mode (outputs to dist/standalone)
npm run build:system     # Build system mode (outputs to dist/system)
npm run build:both       # Build both modes
npm run start            # Run standalone production build locally
npm run deploy           # Deploy to Cloudflare Workers (system mode)
npm run deploy:staging   # Deploy to staging environment
npm run deploy:production # Deploy to production environment
```

### Database Operations
```bash
npm run db:push              # Push schema changes (uses current drizzle.config.ts)
npm run db:push:system       # Push system schema to PostgreSQL
npm run db:push:standalone   # Push standalone schema to SQLite
npm run db:seed              # Seed IT CAN BE LLC entity structure
```

**First-Time Setup (System Mode)**:
```bash
MODE=system npm run db:push:system   # Create tables
npm run db:seed                      # Create tenants and users
```

**First-Time Setup (Standalone Mode)**:
```bash
npm run db:push:standalone   # Create SQLite tables
# No seeding needed - single user mode
```

**Critical**:
- Port 5000 is hardcoded in `server/index.ts:62` and cannot be changed (Replit firewall requirement)
- Server uses `reusePort: true` for multiple process support on the same port

## Architecture

### Dual-Mode Operation

ChittyFinance supports two operational modes (controlled by `MODE` environment variable):

**Standalone Mode** (default for local development):
- SQLite database for quick local development
- Single-tenant (no multi-tenancy overhead)
- Simplified schema in `database/standalone.schema.ts`
- Build output: `dist/standalone/`
- Database file: `./chittyfinance.db`
- Run: `npm run dev` or `npm run dev:standalone`

**System Mode** (production - multi-tenant):
- PostgreSQL (Neon) with full multi-tenancy
- Supports IT CAN BE LLC entity structure
- Complete schema in `database/system.schema.ts`
- Build output: `dist/system/`
- Cloudflare Workers deployment
- Run: `npm run dev:system`
- Deploy: `npm run deploy` or `npm run deploy:production`

**Mode Detection**:
- Default: `npm run dev` runs in standalone mode
- Explicitly set: `MODE=system npm run dev`
- Auto-detection script: `npm run mode:detect`

### Multi-Tenant Architecture (System Mode)

**IT CAN BE LLC Entity Structure:**

```
IT CAN BE LLC (holding)
├── JEAN ARLENE VENTURING LLC (personal, 85% owner)
├── ARIBIA LLC (series, 100% owned)
│   ├── ARIBIA LLC - MGMT (management)
│   │   ├── Chicago Furnished Condos (consumer brand)
│   │   └── Chitty Services (vendor/tech services)
│   ├── ARIBIA LLC - CITY STUDIO (property)
│   │   └── 550 W Surf St C211, Chicago IL
│   └── ARIBIA LLC - APT ARLENE (property)
│       └── 4343 N Clarendon #1610, Chicago IL
└── ChittyCorp LLC (holding, pending formation)
```

**Tenant Types:**
- `holding` - Holding companies (IT CAN BE LLC, ChittyCorp LLC)
- `series` - Series LLCs (ARIBIA LLC)
- `property` - Property holding entities (City Studio, Apt Arlene)
- `management` - Management companies (ARIBIA LLC - MGMT)
- `personal` - Personal entities (JEAN ARLENE VENTURING LLC)

**Key Features:**
- Each tenant has isolated financial data
- Inter-company transaction tracking
- Property-specific rent roll and lease management
- User access control per tenant (roles: owner, admin, manager, viewer)
- Consolidated reporting across entities

### Tech Stack
- **Frontend**: React 18 with TypeScript, Wouter (routing), shadcn/ui (Radix UI components)
- **Backend**: Express.js with TypeScript
- **Database**: Neon PostgreSQL with Drizzle ORM
- **Build**: Vite (frontend), esbuild (backend)
- **Styling**: Tailwind CSS with tailwindcss-animate
- **State**: TanStack React Query for server state
- **Payments**: Stripe integration
- **AI**: OpenAI GPT-4o for financial advice

### Project Structure

```
chittyfinance/
├── client/                 # React frontend (Vite root)
│   └── src/
│       ├── pages/         # Page components (Dashboard, Settings, Landing)
│       ├── components/    # Reusable UI components (shadcn/ui)
│       ├── hooks/         # Custom React hooks
│       └── lib/           # Client utilities
├── server/                # Express backend
│   ├── index.ts          # Server entry point (port 5000)
│   ├── routes.ts         # API route definitions
│   ├── storage.ts        # Database abstraction layer (IStorage interface)
│   ├── db.ts             # Neon database connection
│   └── lib/              # Server utilities
│       ├── openai.ts             # AI financial advice (GPT-4o)
│       ├── financialServices.ts  # Mercury/Wave integration (mock data)
│       ├── chargeAutomation.ts   # Recurring charge analysis
│       └── github.ts             # GitHub API integration
└── shared/                # Shared types and schemas
    └── schema.ts         # Single PostgreSQL schema (Drizzle)
```

## Database Architecture

### System Mode Schema (Multi-Tenant PostgreSQL)

**Location**: `database/system.schema.ts`

**Core Tables**:
- `tenants` - Legal entities (LLCs, properties, management companies)
- `users` - User accounts with email/password + optional ChittyID
- `tenant_users` - User access to tenants with role-based permissions
- `accounts` - Bank accounts, credit cards (tenant-scoped)
- `transactions` - Financial transactions with decimal precision
- `intercompany_transactions` - Transfers between tenants

**Property Management Tables**:
- `properties` - Real estate assets
- `units` - Rental units (if property has multiple units)
- `leases` - Tenant leases with rent and dates

**Supporting Tables**:
- `integrations` - Mercury/Wave/Stripe API connections
- `tasks` - Financial tasks
- `ai_messages` - AI conversation history

**Key Characteristics**:
- **UUIDs for primary keys** (better for distributed systems)
- **Decimal precision** for all monetary amounts (12,2)
- **Full multi-tenancy** with tenant isolation
- **Hierarchical tenants** (parent-child relationships)
- **Indexed** for performance (tenant_id, date, etc.)

### Standalone Mode Schema (Single-Tenant SQLite)

**Location**: `database/standalone.schema.ts`

**Simplified Tables**:
- `users`, `accounts`, `transactions`, `properties`, `tasks`, `integrations`

**Key Characteristics**:
- Text IDs (simpler for SQLite)
- Real (float) for amounts (acceptable for dev)
- No multi-tenancy (single user)
- Faster for local development

### Database Connection

**Mode-Aware Connection** (`server/db.ts`):

The database connection automatically switches based on `MODE` environment variable:

**System Mode** (MODE=system):
```typescript
// PostgreSQL (Neon) with multi-tenant schema
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzleNeon({ client: pool, schema: systemSchema });
```

**Standalone Mode** (MODE=standalone):
```typescript
// SQLite for local development
const sqlite = new Database('./chittyfinance.db');
const db = drizzleBetterSqlite(sqlite, { schema: standaloneSchema });
```

**Environment Variables**:
- System mode: `DATABASE_URL` (Neon PostgreSQL connection string)
- Standalone mode: `SQLITE_FILE` (optional, defaults to `./chittyfinance.db`)

### Database Seeding (System Mode)

**Seed Script**: `database/seeds/it-can-be-llc.ts`

Creates the complete IT CAN BE LLC entity structure:
1. IT CAN BE LLC (parent holding company)
2. JEAN ARLENE VENTURING LLC (85% owner, personal income funnel)
3. ARIBIA LLC (series parent)
4. ARIBIA LLC - MGMT (management company with two brands)
5. ARIBIA LLC - CITY STUDIO (property entity)
6. ARIBIA LLC - APT ARLENE (property entity)
7. ChittyCorp LLC (pending formation)

Also creates:
- Property records for City Studio and Apt Arlene
- User accounts for Nicholas Bianchi and Sharon E Jones
- Access permissions for each user to appropriate tenants

**Run seeding**:
```bash
npm run db:seed
```

**Note**: Only run after pushing the system schema (`npm run db:push:system`)

### Storage Abstraction Layer

**Critical Pattern**: All database access goes through `server/storage.ts`. Never write direct Drizzle queries in routes.

**⚠️ Important**: The current `server/storage.ts` uses the old `shared/schema.ts` and needs to be updated to use `database/system.schema.ts` with tenant-aware queries.

**Interface** (`server/storage.ts:12-42`):
```typescript
export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Integration operations
  getIntegrations(userId: number): Promise<Integration[]>;
  createIntegration(integration: InsertIntegration): Promise<Integration>;
  updateIntegration(id: number, integration: Partial<Integration>): Promise<Integration | undefined>;

  // Financial summary operations
  getFinancialSummary(userId: number): Promise<FinancialSummary | undefined>;
  createFinancialSummary(summary: InsertFinancialSummary): Promise<FinancialSummary>;

  // Transaction, Task, and AI Message operations...
}
```

**Usage in routes** (`server/routes.ts`):
```typescript
import { storage } from "./storage";

const user = await storage.getUserByUsername("demo");
const summary = await storage.getFinancialSummary(user.id);
```

## Key Features

### 1. Demo Authentication

**Current implementation**: Auto-login as "demo" user (no real authentication).

**Pattern** (`server/routes.ts:21-33`):
```typescript
api.get("/session", async (req: Request, res: Response) => {
  const user = await storage.getUserByUsername("demo");
  // Returns demo user for all requests
});
```

**Note**: All API routes assume demo user. Real authentication needs to be implemented for production.

### 2. Financial Dashboard

- **Real-time financial summary**: Cash on hand, revenue, expenses, outstanding invoices
- **Data source**: Cached in `financialSummaries` table, fetched from integrations
- **Demo data**: Hardcoded values if no summary exists (`server/routes.ts:51-55`)

### 3. AI Financial Advice

**Location**: `server/lib/openai.ts`

**Model**: GPT-4o (hardcoded, comment at line 3 warns against changing)

**Functions**:
- `getFinancialAdvice()` - Conversational financial advice based on financial data
- `generateCostReductionPlan()` - AI-generated cost reduction strategies

**API endpoint**: `POST /api/ai/message` sends user query to OpenAI with financial context

### 4. Recurring Charge Automation

**Location**: `server/lib/chargeAutomation.ts`

**Capabilities**:
- Identify recurring charges from integrated services
- Generate optimization recommendations (cancel, downgrade, consolidate, negotiate)
- Calculate potential savings

**API endpoints**:
- `GET /api/recurring-charges` - List all recurring charges
- `GET /api/recurring-charges/:id/optimizations` - Get optimization suggestions
- `POST /api/recurring-charges/:id/manage` - Execute management action

### 5. Third-Party Integrations (Phase 3 - COMPLETED)

**Mercury Bank** (`server/lib/financialServices.ts:22-51`, via ChittyConnect):
- **Real integration** through ChittyConnect backend
- Multi-account support with account selection
- Static egress IP for bank compliance
- Fetches balances and transactions
- Falls back to minimal data in standalone mode
- Routes: `/api/mercury/accounts`, `/api/mercury/select-accounts`
- Configuration: Requires `CHITTYCONNECT_API_BASE` + `CHITTYCONNECT_API_TOKEN`

**Wave Accounting** (`server/lib/wave-api.ts` + `server/lib/financialServices.ts:54-116`):
- **Real integration** via OAuth 2.0 + GraphQL API
- Complete OAuth flow with CSRF protection (HMAC-signed state tokens)
- Fetches invoices, expenses, and financial summaries
- Automatic token refresh support
- Routes: `/api/integrations/wave/authorize`, `/callback`, `/refresh`
- Requirements: Wave Pro subscription, `WAVE_CLIENT_ID`, `WAVE_CLIENT_SECRET`
- Security: Uses `server/lib/oauth-state.ts` for secure state token generation/validation

**Stripe** (`server/lib/stripe.ts`):
- **Real integration** for payment processing
- Customer management with tenant metadata
- Checkout session creation (ad-hoc payments)
- Webhook verification and idempotent event processing
- Routes: `/api/integrations/stripe/connect`, `/checkout`, `/webhook`
- Configuration: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- Events stored in `webhook_events` table (see `shared/finance.schema.ts`)

**DoorLoop** (`server/lib/financialServices.ts:119-147`):
- **Mock data** (property management)
- Returns hardcoded rent roll and maintenance data
- Real API integration pending

**GitHub** (`server/lib/github.ts`):
- Real GitHub API integration (not mock)
- Fetches repositories, commits, PRs, issues
- Used for project cost attribution

**Integration Status Monitoring**:
- New endpoint: `GET /api/integrations/status` (server/routes.ts:122-126)
- Validates which integrations are properly configured
- Uses `server/lib/integration-validation.ts` to check environment variables
- Returns configuration status for wave, stripe, mercury, openai

## Utilities

### check_system_operations_duplicates.js

A utility script for analyzing and detecting duplicate operations in system mode. Located at the project root. This script helps maintain code quality when working with ChittyOS integration.

## Development Workflows

### Adding a New Feature

1. **Update database schema** in `shared/schema.ts`:
   ```typescript
   export const newTable = pgTable("new_table", {
     id: serial("id").primaryKey(),
     userId: integer("user_id").notNull().references(() => users.id),
     // ... fields
   });
   ```

2. **Run migration**: `npm run db:push`

3. **Add storage methods** in `server/storage.ts`:
   ```typescript
   async getNewData(userId: number): Promise<NewData[]> {
     return await db.select().from(newTable).where(eq(newTable.userId, userId));
   }
   ```

4. **Create API routes** in `server/routes.ts`:
   ```typescript
   api.get("/new-data", async (req: Request, res: Response) => {
     const user = await storage.getUserByUsername("demo");
     const data = await storage.getNewData(user.id);
     res.json(data);
   });
   ```

5. **Build frontend** in `client/src/pages/`:
   - Use TanStack Query for data fetching
   - Import shadcn/ui components from `@/components/ui/`

### Working with AI Features

**OpenAI Configuration** (`server/lib/openai.ts:4`):
```typescript
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "demo-key" });
```

**Best practices**:
- Model is GPT-4o (do not change without user request per comment)
- Max tokens: 500 for financial advice
- Include financial context in system prompt
- Handle API errors gracefully (rate limits, invalid keys)
- Demo key "demo-key" will not work in production

### Path Aliases

**Configured in `tsconfig.json:18-21`**:
```json
{
  "@/*": ["./client/src/*"],
  "@shared/*": ["./shared/*"]
}
```

**Additional alias in `vite.config.ts:25`**:
```typescript
"@assets": path.resolve(import.meta.dirname, "attached_assets")
```

**Usage**:
```typescript
import { Button } from "@/components/ui/button";
import { users } from "@shared/schema";
import logo from "@assets/logo.png";
```

## API Endpoints

### Authentication
- `GET /api/session` - Get current demo user (no auth required)

### Financial Data
- `GET /api/financial-summary` - Get cached financial summary
- `GET /api/transactions` - List transactions with optional filters

### Integrations
- `GET /api/integrations` - List configured integrations
- `GET /api/integrations/status` - Check which integrations are properly configured
- `POST /api/integrations` - Add new integration
- `PATCH /api/integrations/:id` - Update integration credentials
- `GET /api/integrations/events` - List webhook events with optional source filter
- `POST /api/admin/events/replay` - Replay webhook events to ChittyOS services

#### Wave Accounting
- `GET /api/integrations/wave/authorize` - Start OAuth flow (returns authorization URL)
- `GET /api/integrations/wave/callback` - OAuth callback handler (redirects to /connections)
- `POST /api/integrations/wave/refresh` - Refresh expired access token

#### Stripe
- `POST /api/integrations/stripe/connect` - Create/fetch Stripe customer
- `POST /api/integrations/stripe/checkout` - Create ad-hoc payment session
- `POST /api/integrations/stripe/webhook` - Stripe webhook endpoint (signature verified)

#### Mercury Bank
- `GET /api/mercury/accounts` - List available Mercury accounts via ChittyConnect
- `POST /api/mercury/select-accounts` - Select which accounts to sync
- `POST /api/integrations/mercury/webhook` - Mercury webhook endpoint (authenticated)

### Recurring Charges
- `GET /api/recurring-charges` - List recurring charges from integrations
- `GET /api/recurring-charges/:id/optimizations` - Get AI optimization suggestions
- `POST /api/recurring-charges/:id/manage` - Pause/cancel/optimize subscription

### AI Services
- `POST /api/ai/advice` - Get initial AI financial advice
- `POST /api/ai/cost-reduction` - Generate cost reduction plan
- `POST /api/ai/message` - Conversational AI advice (includes previous context)

### GitHub Integration
- `GET /api/github/repositories` - List user repositories
- `GET /api/github/commits/:repo` - Get repository commits
- `GET /api/github/pulls/:repo` - Get pull requests
- `GET /api/github/issues/:repo` - Get issues

### Tasks
- `GET /api/tasks` - List financial tasks
- `POST /api/tasks` - Create task
- `PATCH /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task

## Environment Configuration

### Required Variables

**Database** (required):
```bash
DATABASE_URL="postgresql://user:pass@host/dbname"
```

**Application**:
```bash
NODE_ENV="development"                              # or "production"
MODE="standalone"                                   # or "system" (multi-tenant)
PUBLIC_APP_BASE_URL="http://localhost:5000"        # Base URL for OAuth redirects
```

**OAuth Security** (required for production):
```bash
OAUTH_STATE_SECRET="random-secret-32chars"         # HMAC secret for OAuth state tokens
```

**AI & OpenAI** (optional for development, required for AI features):
```bash
OPENAI_API_KEY="sk-..."                            # Required for AI financial advice
```

**Wave Accounting** (Phase 3 - Real Integration):
```bash
WAVE_CLIENT_ID="..."                               # OAuth client ID from Wave Developer Portal
WAVE_CLIENT_SECRET="..."                           # OAuth client secret
WAVE_REDIRECT_URI="http://localhost:5000/api/integrations/wave/callback"  # Optional, defaults to PUBLIC_APP_BASE_URL/api/integrations/wave/callback
```

**Stripe** (Phase 3 - Real Integration):
```bash
STRIPE_SECRET_KEY="sk_test_..."                    # Stripe secret key (test or live)
STRIPE_PUBLISHABLE_KEY="pk_test_..."               # Stripe publishable key (optional, frontend)
STRIPE_WEBHOOK_SECRET="whsec_..."                  # Webhook signing secret for verification
```

**Mercury Bank** (Phase 3 - Real Integration via ChittyConnect):
```bash
CHITTYCONNECT_API_BASE="https://connect.chitty.cc"  # ChittyConnect backend URL
CHITTYCONNECT_API_TOKEN="..."                       # Service authentication token
CHITTY_CONNECT_URL="https://connect.chitty.cc"      # Frontend redirect URL (optional)
```

**GitHub** (optional):
```bash
GITHUB_TOKEN="ghp_..."                             # Required for GitHub integration
```

### Local Development Setup

1. **Provision Neon database**:
   - Create database at https://neon.tech
   - Copy connection string to `DATABASE_URL`

2. **Initialize schema**:
   ```bash
   npm run db:push
   ```

3. **Create demo user** (manual step required):
   ```sql
   INSERT INTO users (username, password, display_name, email, role)
   VALUES ('demo', 'hashed_password', 'Demo User', 'demo@example.com', 'user');
   ```

4. **Start dev server**:
   ```bash
   npm run dev
   ```

5. **Access application**: http://localhost:5000

## Testing

### Manual Testing
1. Start dev server: `npm run dev`
2. Navigate to http://localhost:5000
3. Application auto-logs in as "demo" user
4. Test dashboard, integrations, AI chat
5. Check browser console for errors
6. Monitor server logs in terminal

### Testing AI Features
- Set valid `OPENAI_API_KEY` in environment
- Use `/api/ai/message` endpoint with financial data
- Monitor OpenAI usage at https://platform.openai.com/usage

### Testing Integrations
- All integrations currently return mock data
- To test real APIs, modify functions in `server/lib/financialServices.ts`
- Add real API keys and replace mock implementations

## Common Issues & Solutions

### Database Connection Errors

**Error**: `DATABASE_URL must be set`

**Solutions**:
1. Verify `DATABASE_URL` environment variable is set
2. Test connection: `psql $DATABASE_URL -c "SELECT 1"`
3. Check Neon dashboard for database status
4. Ensure WebSocket support (`ws` package installed)

### Port 5000 Already in Use

**Error**: `EADDRINUSE: address already in use :::5000`

**Solution**:
```bash
lsof -ti:5000 | xargs kill -9
```

**Note**: Port cannot be changed (hardcoded for Replit deployment).

### OpenAI API Errors

**Error**: 401 Unauthorized or 429 Rate Limit

**Solutions**:
1. Verify `OPENAI_API_KEY` is valid
2. Check API key has credits at https://platform.openai.com/account/billing
3. Implement rate limiting or caching for AI requests
4. Handle errors gracefully (see `server/lib/openai.ts:58-60`)

### Demo User Not Found

**Error**: `Demo user not found` from `/api/session`

**Solution**: Create demo user in database:
```sql
INSERT INTO users (username, password, display_name, email, role)
VALUES ('demo', 'any_value', 'Demo User', 'demo@example.com', 'user');
```

### Type Checking Failures

**Error**: TypeScript errors from `npm run check`

**Common causes**:
1. Schema changes not reflected in types (types are auto-generated from schema)
2. Missing imports from `@shared/schema`
3. Path alias not resolving (check `tsconfig.json`)

**Solution**: Verify schema exports match usage, run `npm run check` to see all errors.

## ChittyOS Integration Points

### ChittyID Integration (Planned)
- Replace demo authentication with ChittyID
- Link financial data to ChittyID for cross-platform identity
- Each user should have associated ChittyID DID

### ChittyConnect Integration (Planned)
- Expose financial summary as MCP resource
- Provide AI financial advice as MCP tool
- Enable cross-service financial queries

### ChittyChronicle Integration (Planned)
- Log all financial transactions to audit trail
- Track AI advice and outcomes
- Compliance and forensic analysis

## Development Best Practices

### Database Changes
1. Update `shared/schema.ts` (single source of truth)
2. Run `npm run db:push` to apply changes
3. Test with demo user in development
4. Types are auto-generated from schema (no manual type updates needed)

### API Design
- Always use `storage` abstraction layer (never direct Drizzle queries in routes)
- Validate inputs with Zod schemas from `@shared/schema`
- Use consistent error handling pattern
- Return JSON responses with appropriate status codes

### Frontend Development
- Use shadcn/ui components for consistency (`@/components/ui/*`)
- Implement responsive design with Tailwind utilities
- Use TanStack Query for all API calls (handles caching, loading, errors)
- Optimize re-renders with proper React patterns (memo, useCallback)

### Security Considerations

**OAuth Security** (Phase 3 implemented):
- **CSRF Protection**: OAuth state tokens use HMAC-SHA256 signatures (`server/lib/oauth-state.ts`)
- **Replay Prevention**: State tokens expire after 10 minutes (timestamp validation)
- **Tampering Detection**: State includes cryptographic signature verified server-side
- **Production Requirement**: Set `OAUTH_STATE_SECRET` to random 32+ character string

**Webhook Security**:
- **Stripe**: Webhook signatures verified using `STRIPE_WEBHOOK_SECRET`
- **Mercury**: Service authentication via `serviceAuth` middleware
- **Idempotency**: All webhook events deduplicated using `webhook_events` table

**Integration Validation** (`server/lib/integration-validation.ts`):
- Validates required environment variables before allowing integration connections
- Returns 503 Service Unavailable if integration not properly configured
- Prevents cryptic errors from misconfigured services

**General Security**:
- **Critical**: Replace demo authentication before production (ChittyID integration pending)
- Never commit API keys (use environment variables)
- Sanitize financial data in logs (mask account numbers)
- Validate all user inputs on backend (Zod schemas)
- Use HTTPS in production (HTTP allowed for local dev only)
- Credential data stored as JSONB in database (encrypted at rest by Neon)

## Known Limitations

1. **No Real Authentication**: Demo user auto-login is insecure for production (ChittyID integration pending)
2. **DoorLoop Still Mock**: DoorLoop integration returns hardcoded data (real API integration pending)
3. **Hardcoded Port**: Port 5000 required for Replit (cannot be changed)
4. **No Migrations**: Uses `drizzle-kit push` (destructive) instead of proper migrations
5. **Storage Layer Not Updated**: `server/storage.ts` still uses old schema (needs tenant-aware queries)
6. **Routes Not Updated**: API routes in `server/routes.ts` still use demo auth and old storage methods
7. **Frontend Not Updated**: React components need to support tenant switching
8. **Wrangler Config Incomplete**: KV/R2 IDs in `deploy/system-wrangler.toml` are placeholders

## Future Enhancements

### Phase 1: Complete Multi-Tenant Implementation (In Progress)
- ✅ Database schemas created (system.schema.ts, standalone.schema.ts)
- ✅ Seeding script for IT CAN BE LLC entities
- ✅ Mode-aware database connection
- ✅ Wrangler configuration template
- ⏳ Update `server/storage.ts` for tenant-aware queries
- ⏳ Update `server/routes.ts` to use new storage methods and support tenants
- ⏳ Add authentication with tenant selection
- ⏳ Update frontend with tenant switcher
- ⏳ Add tenant-scoped API middleware

### Phase 2: ChittyConnect Integration (Partially Completed)
- ✅ Mercury Bank via ChittyConnect backend (multi-account support)
- ⏳ Register with ChittyRegistry
- ⏳ Integrate with ChittyConnect MCP
- ⏳ Log to ChittyChronicle
- ⏳ Use ChittyAuth tokens

### Phase 3: Real Third-Party Integrations (COMPLETED ✅)
- ✅ **Wave Accounting** - OAuth 2.0 flow + GraphQL API (`server/lib/wave-api.ts`)
- ✅ **Stripe** - Payment processing, checkout, webhooks (`server/lib/stripe.ts`)
- ✅ **Mercury Bank** - Multi-account via ChittyConnect (static egress IP)
- ✅ **OAuth Security** - CSRF-protected state tokens (`server/lib/oauth-state.ts`)
- ✅ **Integration Monitoring** - Config validation endpoint (`/api/integrations/status`)
- ✅ **Webhook Infrastructure** - Idempotent event processing (`webhook_events` table)
- ⏳ **DoorLoop** - Real property management API (currently mock)

### Phase 4: Property Management & Valuation Features (In Progress)
- ✅ Valuation Console (`client/src/pages/ValuationConsole.tsx`)
- ⏳ Integrate ValuationConsole with dashboard
- ⏳ Rent roll tracking per property
- ⏳ Lease expiration notifications
- ⏳ Maintenance request system
- ⏳ Vendor payment tracking
- ⏳ Occupancy rate reporting

### Phase 5: ChittyOS Ecosystem Integration
- ⏳ Replace demo auth with ChittyID
- ⏳ Expose financial data as MCP resources
- ⏳ Log to ChittyChronicle (audit trail)
- ⏳ Issue ChittyCert certificates for secure connections

### Phase 6: Advanced Features
- Consolidated reporting across all entities
- Inter-company allocation automation
- Tax optimization and reporting
- Advanced AI forecasting (beyond GPT-4o)
- Mobile app (React Native)
- Export/import (CSV, QFX, OFX)
- Multi-currency support

## Related Documentation

- **ChittyOS Ecosystem**: `/Users/nb/Projects/development/CLAUDE.md`
- **Mercury API**: https://docs.mercury.com
- **Wave API**: https://developer.waveapps.com
- **Stripe API**: https://stripe.com/docs/api
- **Drizzle ORM**: https://orm.drizzle.team
- **OpenAI API**: https://platform.openai.com/docs
