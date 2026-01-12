# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **🎯 Project Orchestration:** This project follows [ChittyCan™ Project Standards](../CHITTYCAN_PROJECT_ORCHESTRATOR.md)

## Project Overview

**ChittyFinance** is a full-stack financial management platform for the ChittyOS ecosystem. It provides intelligent financial tracking, AI-powered advice, recurring charge optimization, financial forensics investigation capabilities, and integrations with Mercury Bank, Wave Accounting, and Stripe payments.

**Architecture**: Dual-mode operation supporting both PostgreSQL (multi-tenant) and SQLite (standalone) with Express backend and React frontend.

## Essential Commands

### Development
```bash
npm install              # Install dependencies
npm run dev              # Start dev server on port 5000 (NODE_ENV=development)
npm run check            # TypeScript type checking
```

### Build & Deployment
```bash
npm run build            # Build both frontend (Vite) and backend (esbuild)
npm run start            # Run production build (NODE_ENV=production)
```

### Database Operations
```bash
npm run db:push          # Push schema changes using drizzle-kit
```

**Note on Commands**: The CLAUDE.md previously documented many npm scripts (dev:standalone, dev:system, build:standalone, deploy, db:push:system, db:seed, mode:detect) that are not yet implemented in package.json. These are planned for future implementation. Currently only the 5 scripts above are available.

**First-Time Setup (System Mode)**:
```bash
MODE=system npm run db:push   # Push schema to PostgreSQL
# Run seed script manually: tsx database/seeds/it-can-be-llc.ts
```

**First-Time Setup (Standalone Mode)**:
```bash
npm run db:push   # Push schema to SQLite
# No seeding needed - single user mode
```

**Critical**:
- Port 5000 is hardcoded in `server/index.ts` and cannot be changed (Replit firewall requirement)
- Server uses `reusePort: true` for multiple process support on the same port
- Mode detection is handled automatically in `server/db.ts` based on `MODE` environment variable

## Architecture

### Dual-Mode Operation

ChittyFinance supports two operational modes (controlled by `MODE` environment variable):

**Standalone Mode** (default for local development):
- SQLite database for quick local development
- Single-tenant (no multi-tenancy overhead)
- Simplified schema in `database/standalone.schema.ts`
- Database file: `./chittyfinance.db`
- Run: `npm run dev` (defaults to standalone if MODE not set)

**System Mode** (production - multi-tenant):
- PostgreSQL (Neon) with full multi-tenancy
- Supports IT CAN BE LLC entity structure
- Complete schema in `database/system.schema.ts`
- Cloudflare Workers deployment support
- Run: `MODE=system npm run dev`

**Mode Detection** (`server/db.ts`):
- Automatically detects mode from `MODE` environment variable
- Falls back to standalone mode if not specified
- Creates appropriate database connection (PostgreSQL or SQLite)

### Schema Architecture (Important!)

**⚠️ Critical Understanding**: This project uses THREE schema files:

1. **`shared/schema.ts`** (371 lines, 13 tables) - Legacy schema with forensics
   - Used by default Drizzle config (`drizzle.config.ts`)
   - Contains full feature set including forensics tables
   - Still actively used by routes and storage layer
   - **Forensics tables** (not in other schemas):
     - `forensicInvestigations` - Case management
     - `forensicEvidence` - Evidence tracking with chain of custody
     - `forensicTransactionAnalysis` - Analysis results
     - `forensicAnomalies` - Detected anomalies
     - `forensicFlowOfFunds` - Money flow tracing
     - `forensicReports` - Generated reports

2. **`database/system.schema.ts`** (274 lines, 12 tables) - New multi-tenant schema
   - PostgreSQL-specific with UUIDs
   - Multi-tenant with tenant isolation
   - Does NOT include forensics tables yet
   - Used by `drizzle.system.config.ts`

3. **`database/standalone.schema.ts`** (99 lines, 6 tables) - Simplified SQLite schema
   - Single-tenant, text IDs, simplified structure
   - Used by `drizzle.standalone.config.ts`

**Current State**: The project is in transition. Routes and storage use `shared/schema.ts`, but the dual-mode system (`system.schema.ts` + `standalone.schema.ts`) is being developed for cleaner separation. This creates some complexity that developers should be aware of.

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
- TenantSwitcher UI component for switching between entities

### Tech Stack
- **Frontend**: React 18 with TypeScript, Wouter (routing), shadcn/ui (Radix UI components)
- **Backend**: Express.js with TypeScript
- **Database**: Neon PostgreSQL + SQLite (Better-SQLite3) with Drizzle ORM
- **Build**: Vite (frontend), esbuild (backend)
- **Styling**: Tailwind CSS with tailwindcss-animate
- **State**: TanStack React Query for server state
- **Contexts**: TenantContext (multi-tenancy), ThemeContext (theme management)
- **Payments**: Stripe integration
- **AI**: OpenAI GPT-4o for financial advice with budget tracking
- **Deployment**: Cloudflare Workers support

### Project Structure

```
chittyfinance/
├── client/                      # React frontend (Vite root)
│   └── src/
│       ├── pages/              # Page components (9 pages)
│       │   ├── Dashboard.tsx        # Main financial dashboard
│       │   ├── Properties.tsx       # Property portfolio management
│       │   ├── ValuationConsole.tsx # Property valuation analysis
│       │   ├── Connections.tsx      # Integration management
│       │   ├── Settings.tsx         # User settings
│       │   ├── Login.tsx           # Authentication
│       │   ├── ConnectAccounts.tsx # Account connection flow
│       │   └── NotFound.tsx        # 404 page
│       ├── components/         # Reusable UI components (shadcn/ui)
│       │   ├── ui/            # 50+ shadcn/ui components
│       │   ├── layout/        # Sidebar, Header, TenantSwitcher
│       │   └── dashboard/     # Dashboard-specific components
│       ├── contexts/          # React contexts
│       │   ├── TenantContext.tsx   # Multi-tenant state management
│       │   └── ThemeContext.tsx    # Theme management
│       ├── hooks/             # Custom React hooks (toast, mobile, auth)
│       └── lib/               # Client utilities
├── server/                    # Express backend (2000+ line routes.ts)
│   ├── index.ts              # Server entry point (port 5000)
│   ├── routes.ts             # API route definitions (65+ endpoints)
│   ├── storage.ts            # Database abstraction layer (IStorage interface)
│   ├── db.ts                 # Mode-aware database connection
│   ├── worker.ts             # Cloudflare Worker entry point
│   ├── middleware/           # Auth and tenant middleware
│   │   ├── auth.ts          # ChittyConnect service auth
│   │   └── tenant.ts        # Tenant context injection
│   ├── agents/               # Agent implementation
│   ├── __tests__/            # Test files (status.test.ts)
│   └── lib/                  # Server utilities (18 service libraries)
│       ├── openai.ts                # AI financial advice (GPT-4o)
│       ├── openaiBudget.ts          # OpenAI budget tracking
│       ├── financialServices.ts     # Mercury/Wave/DoorLoop integration
│       ├── chargeAutomation.ts      # Recurring charge analysis
│       ├── github.ts                # GitHub API integration
│       ├── stripe.ts                # Stripe payment processing
│       ├── wave-api.ts              # Wave OAuth + GraphQL
│       ├── chittyConnect.ts         # Mercury via ChittyConnect
│       ├── oauth-state.ts           # OAuth CSRF protection
│       ├── integration-validation.ts # Config validation
│       ├── forensics.ts             # Financial forensics suite
│       └── agents.ts                # Agent orchestration
├── database/                  # Database schemas and seeds
│   ├── system.schema.ts      # PostgreSQL multi-tenant schema (12 tables)
│   ├── standalone.schema.ts  # SQLite single-user schema (6 tables)
│   └── seeds/                # Seeding scripts
│       └── it-can-be-llc.ts # IT CAN BE LLC entity structure
├── shared/                    # Shared types and schemas
│   ├── schema.ts             # Legacy schema with forensics (13 tables)
│   └── finance.schema.ts     # Webhook events table
├── deploy/                    # Cloudflare Workers deployment configs
│   ├── system-wrangler.toml  # Production config (finance.chitty.cc)
│   ├── registry-wrangler.toml # Registry service
│   ├── finance-wrangler.toml # Alternative finance config
│   └── registration/         # Service registration manifests
├── scripts/                   # Utility scripts
│   └── detect_mode.ts        # Mode detection utility
├── .claude/commands/          # Claude Code slash commands (5 commands)
│   ├── fix-deploy.md         # Fix deployment blockers
│   ├── quick-deploy.md       # Full deployment workflow
│   ├── check-system.md       # System mode validation
│   ├── db-reset.md           # Database reset
│   └── tenant-switch.md      # Tenant context switching
└── drizzle*.config.ts         # Drizzle ORM configurations (3 files)
```

## Key Features

### 1. Financial Forensics Suite 🆕

**⚠️ Major Feature**: ChittyFinance includes a comprehensive financial forensics investigation system for fraud detection, anomaly analysis, and compliance investigations.

**Location**: `server/lib/forensics.ts` + forensics tables in `shared/schema.ts`

**Capabilities**:
- **Case Management**: Create and manage forensic investigations
- **Evidence Tracking**: Maintain chain of custody for evidence
- **Transaction Analysis**: Multiple detection algorithms:
  - Duplicate transaction detection
  - Timing pattern analysis (unusual hours)
  - Round dollar detection (suspicious patterns)
  - Benford's Law analysis (statistical fraud detection)
- **Flow of Funds**: Trace money movement between accounts
- **Damage Calculations**:
  - Direct loss calculations
  - Net worth method analysis
  - Interest calculations on stolen funds
- **Report Generation**: Generate investigation summaries and reports

**API Endpoints** (20+ forensics endpoints in `server/routes.ts`):
```
POST   /api/forensics/investigations              # Create investigation
GET    /api/forensics/investigations              # List investigations
GET    /api/forensics/investigations/:id          # Get investigation details
PATCH  /api/forensics/investigations/:id/status   # Update investigation status
POST   /api/forensics/evidence                    # Add evidence
GET    /api/forensics/evidence                    # List evidence
PATCH  /api/forensics/evidence/:id/custody        # Update chain of custody
POST   /api/forensics/analysis/duplicates         # Detect duplicate transactions
POST   /api/forensics/analysis/timing             # Analyze transaction timing
POST   /api/forensics/analysis/round-dollars      # Detect round dollar amounts
POST   /api/forensics/analysis/benfords-law       # Apply Benford's Law
POST   /api/forensics/flow-of-funds               # Create flow of funds record
GET    /api/forensics/flow-of-funds/:investigationId # Get flow records
POST   /api/forensics/flow-of-funds/trace         # Trace funds movement
POST   /api/forensics/damage-calculations/direct-loss    # Calculate direct loss
POST   /api/forensics/damage-calculations/net-worth      # Net worth method
POST   /api/forensics/damage-calculations/interest       # Calculate interest
POST   /api/forensics/reports                     # Generate report
GET    /api/forensics/reports/:investigationId    # Get reports
GET    /api/forensics/summary/:investigationId    # Get investigation summary
```

**Database Tables** (`shared/schema.ts`):
- `forensicInvestigations` - Case metadata, status, timeline
- `forensicEvidence` - Evidence items with chain of custody tracking
- `forensicTransactionAnalysis` - Analysis results and scores
- `forensicAnomalies` - Detected anomalies with severity ratings
- `forensicFlowOfFunds` - Money flow tracing records
- `forensicReports` - Generated investigation reports

### 2. Universal Connector API 🆕

**Location**: `server/routes.ts` (lines ~1850-1900)

**Purpose**: Standardized financial data format for external integrations and data exchange.

**Endpoints**:
- `GET /api/universal-connector` - Public standardized API (no auth)
- `GET /api/universal-connector/secured` - Authenticated version

**Features**:
- Consistent data format across all financial platforms
- Easy integration for third-party services
- Supports public and secured access modes

### 3. Demo Authentication

**Current implementation**: Auto-login as "demo" user (no real authentication).

**Pattern** (`server/routes.ts`):
```typescript
api.get("/api/session", async (req: Request, res: Response) => {
  const user = await storage.getUserByUsername("demo");
  // Returns demo user for all requests
});
```

**Note**: All API routes assume demo user. Real authentication needs to be implemented for production (ChittyID integration planned).

### 4. Financial Dashboard

- **Real-time financial summary**: Cash on hand, revenue, expenses, outstanding invoices
- **AI CFO Assistant**: GPT-4o powered conversational financial advice
- **Recent transactions**: Transaction history with filtering
- **Financial tasks**: Task management for financial operations
- **Charge automation**: Recurring charge optimization
- **Connected services**: Integration status monitoring
- **GitHub repositories**: Project cost attribution

**Components** (`client/src/components/dashboard/`):
- `FinancialSummary` - Key metrics display
- `AICFOAssistant` - Chat interface for AI advice
- `RecentTransactions` - Transaction list
- `FinancialTasks` - Task management
- `ChargeAutomation` - Recurring charge optimization
- `ConnectedServices` - Integration status cards
- `GitHubRepositories` - Repository list

### 5. AI Financial Advice

**Location**: `server/lib/openai.ts` + `server/lib/openaiBudget.ts`

**Model**: GPT-4o (hardcoded, comment warns against changing)

**Functions**:
- `getFinancialAdvice()` - Conversational financial advice based on financial data
- `generateCostReductionPlan()` - AI-generated cost reduction strategies
- Budget tracking system to monitor OpenAI API usage

**API endpoints**:
- `GET /api/ai-messages` - Get conversation history
- `GET /api/ai-assistant/latest` - Get latest AI response
- `POST /api/ai-assistant/query` - Send query to AI
- `POST /api/ai-assistant/generate-plan` - Generate cost reduction plan

### 6. Recurring Charge Automation

**Location**: `server/lib/chargeAutomation.ts`

**Capabilities**:
- Identify recurring charges from integrated services
- Generate optimization recommendations (cancel, downgrade, consolidate, negotiate)
- Calculate potential savings

**API endpoints**:
- `GET /api/charges/recurring` - List all recurring charges
- `GET /api/charges/optimizations` - Get optimization suggestions
- `POST /api/charges/manage` - Execute management action

### 7. Property Management

**Pages**:
- `/properties` - Property portfolio dashboard
- `/valuation/550-w-surf-504` - Valuation Console for specific property

**Features**:
- Property portfolio tracking
- Lease management
- Occupancy monitoring
- Valuation analysis (Valuation Console)
- Property-specific financial data

**API endpoints**:
- `GET /api/properties` - List properties (tenant-scoped)
- `GET /api/properties/:id` - Get property details
- Additional property endpoints in routes

### 8. Third-Party Integrations (Phase 3 - COMPLETED)

**Mercury Bank** (`server/lib/chittyConnect.ts`, via ChittyConnect):
- **Real integration** through ChittyConnect backend
- Multi-account support with account selection
- Static egress IP for bank compliance
- Fetches balances and transactions
- Falls back to minimal data in standalone mode
- Routes: `/api/mercury/accounts`, `/api/mercury/select-accounts`
- Configuration: Requires `CHITTYCONNECT_API_BASE` + `CHITTYCONNECT_API_TOKEN`

**Wave Accounting** (`server/lib/wave-api.ts`):
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

**DoorLoop** (`server/lib/financialServices.ts`):
- **Mock data** (property management)
- Returns hardcoded rent roll and maintenance data
- Real API integration pending

**GitHub** (`server/lib/github.ts`):
- Real GitHub API integration (not mock)
- Fetches repositories, commits, PRs, issues
- Used for project cost attribution

**Integration Status Monitoring**:
- Endpoint: `GET /api/integrations/status`
- Validates which integrations are properly configured
- Uses `server/lib/integration-validation.ts` to check environment variables
- Returns configuration status for wave, stripe, mercury, openai

## API Endpoints (65+ endpoints)

### Core System
- `GET /api/v1/status` - System mode and health check
- `GET /api/session` - User session (auto-login as demo)
- `GET /connect` - Redirect to ChittyConnect
- `GET /register` - Redirect to ChittyRegister

### Multi-Tenant (System Mode)
- `GET /api/tenants` - List user's tenants
- `GET /api/tenants/:id` - Get tenant details
- `GET /api/accounts` - Tenant-scoped accounts
- `GET /api/transactions` - Tenant-scoped transactions

### Financial Data
- `GET /api/financial-summary` - Get cached financial summary
- `GET /api/transactions` - List transactions with filters

### Integrations
- `GET /api/integrations` - List configured integrations
- `GET /api/integrations/status` - Configuration validation
- `POST /api/integrations` - Add new integration
- `PATCH /api/integrations/:id` - Update integration credentials
- `GET /api/integrations/events` - Webhook event log
- `POST /api/admin/events/replay` - Replay webhook events

#### Wave Accounting
- `GET /api/integrations/wave/authorize` - Start OAuth flow
- `GET /api/integrations/wave/callback` - OAuth callback
- `POST /api/integrations/wave/refresh` - Refresh access token

#### Stripe
- `POST /api/integrations/stripe/connect` - Create/fetch Stripe customer
- `POST /api/integrations/stripe/checkout` - Create checkout session
- `POST /api/integrations/stripe/webhook` - Stripe webhook endpoint

#### Mercury Bank
- `GET /api/mercury/accounts` - List Mercury accounts
- `POST /api/mercury/select-accounts` - Select accounts to sync
- `POST /api/integrations/mercury/webhook` - Mercury webhook

### Recurring Charges
- `GET /api/charges/recurring` - List recurring charges
- `GET /api/charges/optimizations` - Get optimization suggestions
- `POST /api/charges/manage` - Manage subscription

### AI Services
- `GET /api/ai-messages` - Conversation history
- `GET /api/ai-assistant/latest` - Latest AI response
- `POST /api/ai-assistant/query` - Send query to AI
- `POST /api/ai-assistant/generate-plan` - Generate cost reduction plan

### Financial Forensics (20+ endpoints)
See "Financial Forensics Suite" section above for complete list.

### GitHub Integration
- `GET /api/github/repositories` - List repositories
- `GET /api/github/repositories/:repo/commits` - Get commits
- `GET /api/github/repositories/:repo/pulls` - Get pull requests
- `GET /api/github/repositories/:repo/issues` - Get issues

### Universal Connector
- `GET /api/universal-connector` - Public standardized API
- `GET /api/universal-connector/secured` - Authenticated version

### Property Management
- `GET /api/properties` - List properties
- `GET /api/properties/:id` - Get property details

### Tasks
- `GET /api/tasks` - List financial tasks
- `POST /api/tasks` - Create task
- `PATCH /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task

### Testing/Development
- `GET /api/test-financial-platform/:platformId` - Test platform integration
- `GET /api/test-platform/:platformId` - Generic platform test

## Database Architecture

See "Schema Architecture" section above for critical information about the THREE schema files.

### Storage Abstraction Layer

**Critical Pattern**: All database access should go through `server/storage.ts`. Never write direct Drizzle queries in routes.

**Current State**: The storage layer bridges between the legacy `shared/schema.ts` and the dual-mode system. This creates some complexity but maintains backward compatibility.

**Interface** (`server/storage.ts`):
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

  // Financial operations, transactions, tasks, AI messages...
}
```

## Development Workflows

### Adding a New Feature

1. **Understand schema architecture**: Determine which schema file to modify:
   - `shared/schema.ts` - Currently used by routes (includes forensics)
   - `database/system.schema.ts` - For multi-tenant PostgreSQL features
   - `database/standalone.schema.ts` - For standalone SQLite features

2. **Update appropriate schema**:
   ```typescript
   export const newTable = pgTable("new_table", {
     id: serial("id").primaryKey(),
     userId: integer("user_id").notNull().references(() => users.id),
     // ... fields
   });
   ```

3. **Run migration**: `npm run db:push`

4. **Add storage methods** in `server/storage.ts` (if using legacy schema)

5. **Create API routes** in `server/routes.ts`

6. **Build frontend** in `client/src/pages/`:
   - Use TanStack Query for data fetching
   - Import shadcn/ui components from `@/components/ui/`
   - Use TenantContext for multi-tenant aware components

### Working with Multi-Tenancy

**Frontend**:
```typescript
import { useTenant } from '@/contexts/TenantContext';

function MyComponent() {
  const { currentTenant, isSystemMode } = useTenant();

  if (!isSystemMode) {
    // Standalone mode - no tenant switching
    return <StandaloneView />;
  }

  return <TenantAwareView tenantId={currentTenant?.id} />;
}
```

**Backend** (using tenant middleware):
```typescript
api.get("/api/data", tenantMiddleware, async (req, res) => {
  const tenantId = req.tenantId; // Injected by middleware
  // Query data scoped to tenant
});
```

### Working with AI Features

**OpenAI Configuration** (`server/lib/openai.ts`):
```typescript
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "demo-key" });
```

**Budget Tracking** (`server/lib/openaiBudget.ts`):
- Automatically tracks OpenAI API usage
- Prevents overspending
- Monitor usage in logs

**Best practices**:
- Model is GPT-4o (do not change without user request per comment)
- Max tokens: 500 for financial advice
- Include financial context in system prompt
- Handle API errors gracefully (rate limits, invalid keys)
- Demo key "demo-key" will not work in production

### Path Aliases

**Configured in `tsconfig.json`**:
```json
{
  "@/*": ["./client/src/*"],
  "@shared/*": ["./shared/*"]
}
```

**Additional alias in `vite.config.ts`**:
```typescript
"@assets": path.resolve(import.meta.dirname, "attached_assets")
```

**Usage**:
```typescript
import { Button } from "@/components/ui/button";
import { users } from "@shared/schema";
import logo from "@assets/logo.png";
```

### Slash Commands

ChittyFinance includes custom Claude Code slash commands in `.claude/commands/`:

- `/fix-deploy` - Fix critical deployment blockers
- `/quick-deploy` - Execute full deployment workflow
- `/check-system` - Validate system mode readiness
- `/db-reset` - Reset and reseed database
- `/tenant-switch` - Switch tenant context for testing

Use these commands in Claude Code for common operations.

## Environment Configuration

### Required Variables

**Database** (required):
```bash
DATABASE_URL="postgresql://user:pass@host/dbname"  # System mode (PostgreSQL)
SQLITE_FILE="./chittyfinance.db"                   # Standalone mode (optional)
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
WAVE_REDIRECT_URI="http://localhost:5000/api/integrations/wave/callback"  # Optional
```

**Stripe** (Phase 3 - Real Integration):
```bash
STRIPE_SECRET_KEY="sk_test_..."                    # Stripe secret key (test or live)
STRIPE_PUBLISHABLE_KEY="pk_test_..."               # Stripe publishable key (optional)
STRIPE_WEBHOOK_SECRET="whsec_..."                  # Webhook signing secret
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

1. **Provision database**:
   - For system mode: Create Neon database at https://neon.tech
   - For standalone mode: SQLite file created automatically

2. **Set environment variables**: Copy `.env.example` to `.env` and configure

3. **Initialize schema**:
   ```bash
   npm run db:push
   ```

4. **Create demo user** (if needed):
   ```sql
   INSERT INTO users (username, password, display_name, email, role)
   VALUES ('demo', 'hashed_password', 'Demo User', 'demo@example.com', 'user');
   ```

5. **Start dev server**:
   ```bash
   npm run dev
   ```

6. **Access application**: http://localhost:5000

## Testing

### Manual Testing
1. Start dev server: `npm run dev`
2. Navigate to http://localhost:5000
3. Application auto-logs in as "demo" user
4. Test dashboard, integrations, AI chat, properties
5. Check browser console for errors
6. Monitor server logs in terminal

### Automated Testing

**Location**: `server/__tests__/`

**Current tests**:
- `status.test.ts` - System status endpoint testing

**Run tests**: Tests are not yet integrated into npm scripts. Run manually with test runner.

### Testing AI Features
- Set valid `OPENAI_API_KEY` in environment
- Use AI endpoints in API
- Monitor OpenAI usage at https://platform.openai.com/usage
- Check budget tracking logs

### Testing Integrations
- Wave, Stripe, Mercury require real API credentials
- Use integration status endpoint to verify configuration
- Test OAuth flows in browser
- Monitor webhook event log

## Common Issues & Solutions

### Database Connection Errors

**Error**: `DATABASE_URL must be set` (system mode)

**Solutions**:
1. Verify `DATABASE_URL` environment variable is set
2. Test connection: `psql $DATABASE_URL -c "SELECT 1"`
3. Check Neon dashboard for database status
4. Ensure WebSocket support (`ws` package installed)

**Error**: SQLite errors (standalone mode)

**Solutions**:
1. Check file permissions on `./chittyfinance.db`
2. Ensure `better-sqlite3` package is installed
3. Delete database file and re-run `npm run db:push` if corrupted

### Port 5000 Already in Use

**Error**: `EADDRINUSE: address already in use :::5000`

**Solution**:
```bash
lsof -ti:5000 | xargs kill -9
```

**Note**: Port cannot be changed (hardcoded for Replit deployment).

### Schema Confusion

**Error**: Table not found or schema mismatch errors

**Cause**: Three schema files can cause confusion about which schema is active

**Solutions**:
1. Check which Drizzle config is being used (`drizzle.config.ts` by default)
2. Verify `MODE` environment variable for dual-mode system
3. Check `server/db.ts` to see which schema is loaded
4. Ensure `npm run db:push` was run after schema changes

### OpenAI API Errors

**Error**: 401 Unauthorized or 429 Rate Limit

**Solutions**:
1. Verify `OPENAI_API_KEY` is valid
2. Check API key has credits at https://platform.openai.com/account/billing
3. Monitor budget tracking logs (`server/lib/openaiBudget.ts`)
4. Implement rate limiting or caching for AI requests
5. Handle errors gracefully

### Demo User Not Found

**Error**: `Demo user not found` from `/api/session`

**Solution**: Create demo user in database (see Local Development Setup)

### Type Checking Failures

**Error**: TypeScript errors from `npm run check`

**Common causes**:
1. Schema changes not reflected in types (types are auto-generated)
2. Missing imports from `@shared/schema`
3. Path alias not resolving (check `tsconfig.json`)

**Solution**: Verify schema exports match usage, run `npm run check` to see all errors.

## Security Considerations

**OAuth Security** (Phase 3 implemented):
- **CSRF Protection**: OAuth state tokens use HMAC-SHA256 signatures (`server/lib/oauth-state.ts`)
- **Replay Prevention**: State tokens expire after 10 minutes (timestamp validation)
- **Tampering Detection**: State includes cryptographic signature verified server-side
- **Production Requirement**: Set `OAUTH_STATE_SECRET` to random 32+ character string

**Webhook Security**:
- **Stripe**: Webhook signatures verified using `STRIPE_WEBHOOK_SECRET`
- **Mercury**: Service authentication via `serviceAuth` middleware (`server/middleware/auth.ts`)
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
2. **Schema Architecture Complexity**: Three schema files (shared, system, standalone) create confusion about which is active
3. **Incomplete Dual-Mode Migration**: Routes and storage still use `shared/schema.ts`, not yet fully migrated to system/standalone schemas
4. **Forensics Only in Legacy Schema**: Forensics tables only in `shared/schema.ts`, not in `database/system.schema.ts`
5. **Missing npm Scripts**: Many scripts documented in earlier versions don't exist in package.json yet
6. **DoorLoop Still Mock**: DoorLoop integration returns hardcoded data (real API integration pending)
7. **Hardcoded Port**: Port 5000 required for Replit (cannot be changed)
8. **No Migrations**: Uses `drizzle-kit push` (destructive) instead of proper migrations
9. **Wrangler Config Incomplete**: KV/R2 IDs in `deploy/system-wrangler.toml` are placeholders
10. **Limited Test Coverage**: Only one test file exists (`server/__tests__/status.test.ts`)

## ChittyOS Integration Points

### ChittyID Integration (Planned)
- Replace demo authentication with ChittyID
- Link financial data to ChittyID for cross-platform identity
- Each user should have associated ChittyID DID

### ChittyConnect Integration (Partially Completed)
- ✅ Mercury Bank via ChittyConnect backend (multi-account support)
- ⏳ Register with ChittyRegistry
- ⏳ Expose financial summary as MCP resource
- ⏳ Provide AI financial advice as MCP tool
- ⏳ Enable cross-service financial queries

### ChittyChronicle Integration (Planned)
- Log all financial transactions to audit trail
- Track AI advice and outcomes
- Compliance and forensic analysis integration

## Development Best Practices

### Database Changes
1. **Choose correct schema file**:
   - For production features → `shared/schema.ts` (currently active)
   - For multi-tenant only → `database/system.schema.ts`
   - For standalone only → `database/standalone.schema.ts`
2. Run `npm run db:push` to apply changes
3. Test with demo user in development
4. Types are auto-generated from schema (no manual type updates needed)

### API Design
- Always use `storage` abstraction layer (never direct Drizzle queries in routes)
- Validate inputs with Zod schemas from schemas
- Use consistent error handling pattern
- Return JSON responses with appropriate status codes
- Use tenant middleware for multi-tenant endpoints

### Frontend Development
- Use shadcn/ui components for consistency (`@/components/ui/*`)
- Implement responsive design with Tailwind utilities
- Use TanStack Query for all API calls (handles caching, loading, errors)
- Use TenantContext for multi-tenant awareness
- Optimize re-renders with proper React patterns (memo, useCallback)

### Code Organization
- Keep routes.ts focused on routing, move logic to lib/ files
- Create new lib/ files for complex features
- Use middleware for cross-cutting concerns (auth, tenant context)
- Keep components small and focused
- Use TypeScript strictly (run `npm run check` frequently)

## Future Enhancements

### Phase 1: Complete Dual-Mode Migration
- ⏳ Migrate forensics tables to `database/system.schema.ts`
- ⏳ Update routes to use system/standalone schemas exclusively
- ⏳ Deprecate `shared/schema.ts` once migration complete
- ⏳ Implement missing npm scripts (mode:detect, db:seed, deploy, etc.)
- ⏳ Add comprehensive test coverage

### Phase 2: Authentication & Authorization
- ⏳ Replace demo auth with ChittyID
- ⏳ Implement proper session management
- ⏳ Add role-based access control (RBAC)
- ⏳ Secure API endpoints with authentication

### Phase 3: Enhanced Integrations (Mostly COMPLETE ✅)
- ✅ **Wave Accounting** - OAuth 2.0 flow + GraphQL API
- ✅ **Stripe** - Payment processing, checkout, webhooks
- ✅ **Mercury Bank** - Multi-account via ChittyConnect
- ✅ **OAuth Security** - CSRF-protected state tokens
- ✅ **Integration Monitoring** - Config validation endpoint
- ✅ **Webhook Infrastructure** - Idempotent event processing
- ⏳ **DoorLoop** - Real property management API (currently mock)

### Phase 4: Property Management (In Progress)
- ✅ Valuation Console (`client/src/pages/ValuationConsole.tsx`)
- ⏳ Integrate ValuationConsole with dashboard
- ⏳ Rent roll tracking per property
- ⏳ Lease expiration notifications
- ⏳ Maintenance request system
- ⏳ Vendor payment tracking
- ⏳ Occupancy rate reporting

### Phase 5: ChittyOS Ecosystem Integration
- ⏳ Register with ChittyRegistry
- ⏳ Expose financial data as MCP resources
- ⏳ Log to ChittyChronicle (audit trail)
- ⏳ Issue ChittyCert certificates for secure connections
- ⏳ Integrate with ChittyAuth tokens

### Phase 6: Advanced Features
- Consolidated reporting across all entities
- Inter-company allocation automation
- Tax optimization and reporting
- Advanced AI forecasting (beyond GPT-4o)
- Mobile app (React Native)
- Export/import (CSV, QFX, OFX)
- Multi-currency support
- Real-time collaboration features
- Advanced forensics AI (pattern recognition)

## Utilities & Tools

### check_system_operations_duplicates.js

A utility script for analyzing and detecting duplicate operations in system mode. Located at the project root. This script helps maintain code quality when working with ChittyOS integration.

### Mode Detection Script

**Location**: `scripts/detect_mode.ts`

Utility for detecting and displaying current operational mode (system vs standalone).

## Related Documentation

- **ChittyOS Ecosystem**: `/Users/nb/Projects/development/CLAUDE.md`
- **Mercury API**: https://docs.mercury.com
- **Wave API**: https://developer.waveapps.com
- **Stripe API**: https://stripe.com/docs/api
- **Drizzle ORM**: https://orm.drizzle.team
- **OpenAI API**: https://platform.openai.com/docs
- **Cloudflare Workers**: https://developers.cloudflare.com/workers/

---

**Last Updated**: 2026-01-12

**Version**: 2.0 - Comprehensive update reflecting actual codebase state including Financial Forensics Suite, Universal Connector API, and schema architecture clarification.
