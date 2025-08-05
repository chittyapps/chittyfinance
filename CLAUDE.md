# Close Lender - Personal Lending Platform

## Build, Lint, and Test Commands

### Development Commands
```bash
# Start development server (both client and server)
npm run dev

# Type checking
npm run check

# Database operations
npm run db:push
```

### Build Commands
```bash
# Build for production (client + server)
npm run build

# Start production server
npm start
```

### Database Commands
```bash
# Push database schema changes
npm run db:push
```

**Note**: This project does not currently have linting or testing commands configured. Consider adding ESLint, Prettier, and Jest/Vitest for better development workflow.

## High-Level Architecture Overview

### Tech Stack
- **Runtime**: Node.js with TypeScript (ES Modules)
- **Frontend**: React 18 + Vite + Wouter (routing) + TanStack Query (state management)
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Local strategy with Passport.js + Express sessions
- **UI Framework**: Tailwind CSS + shadcn/ui (Radix UI components)
- **File Storage**: Google Cloud Storage
- **AI Integration**: OpenAI API (for document processing)
- **Build Tools**: Vite (client), esbuild (server)

### Project Structure
```
/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   │   └── ui/         # shadcn/ui components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── lib/            # Utility functions
│   │   ├── pages/          # Route components
│   │   └── main.tsx        # App entry point
│   └── index.html          # HTML template
├── server/                 # Express backend
│   ├── auth.ts             # Authentication logic
│   ├── routes.ts           # API route definitions
│   ├── storage.ts          # Database abstraction layer
│   ├── documentProcessor.ts # AI document processing
│   ├── statementService.ts # Automated statement generation
│   ├── cronService.ts      # Scheduled task management
│   └── index.ts            # Server entry point
├── shared/                 # Shared TypeScript types
│   └── schema.ts           # Database schema + Zod validation
└── Configuration files
```

### Key Features
1. **Personal Loan Management**: Create, track, and manage loans between individuals
2. **Dynamic Terminology**: Customizable terms (Lender/Creditor/Helper vs Borrower/Debtor/Friend)
3. **Seasonal Gamification**: Theme-based UI with tree growth visualization for payment tracking
4. **AI Document Processing**: Upload loan documents and extract terms automatically
5. **Timeline Tracking**: Comprehensive activity logging for all loan-related events
6. **Statement Generation**: Automated 30-day statements with cron job scheduling
7. **Tax Calculations**: Interest income/expense tracking with tax implications
8. **Communication System**: In-app messaging between loan participants
9. **Payment Tracking**: Detailed payment history with status tracking
10. **File Management**: Document upload and storage with Google Cloud Storage

### Database Schema
- **users**: User accounts with customizable preferences
- **loans**: Core loan data with AI-extracted information support
- **payments**: Payment history with principal/interest breakdown
- **timelineEvents**: Activity log for all loan-related actions
- **communications**: Message threads between users
- **documents**: File attachments with cloud storage references
- **statements**: Automated periodic statements
- **taxImplications**: Tax calculation data and estimates
- **sessions**: Express session storage

### Authentication Flow
- Local username/password authentication with Passport.js
- Password hashing using Node.js crypto (scrypt)
- Session-based authentication with PostgreSQL storage
- Protected API routes with `requireAuth` middleware

### API Architecture
- RESTful API design with Express.js
- Type-safe request/response handling with Zod validation
- Comprehensive error handling and logging
- Authentication middleware for protected routes
- File upload integration with Google Cloud Storage

## Key Development Workflows

### Adding New Features
1. **Database Changes**: 
   - Update `shared/schema.ts` with new tables/columns
   - Run `npm run db:push` to sync database
2. **Backend API**:
   - Add routes in `server/routes.ts`
   - Implement storage methods in `server/storage.ts`
   - Add authentication if needed
3. **Frontend Implementation**:
   - Create components in `client/src/components/`
   - Add pages in `client/src/pages/`
   - Implement routing in `client/src/App.tsx`
   - Use TanStack Query for API calls

### Component Development
1. Use shadcn/ui components as building blocks
2. Follow the established patterns in existing components
3. Implement proper TypeScript interfaces
4. Use custom hooks for reusable logic
5. Apply Tailwind CSS with consistent design tokens

### Database Operations
1. **Schema Updates**: Modify `shared/schema.ts`
2. **Type Safety**: Use Drizzle ORM generated types
3. **Migrations**: Use `drizzle-kit push` for schema changes
4. **Relations**: Define proper table relationships in schema

### State Management
1. **Server State**: Use TanStack Query for API data
2. **Local State**: Use React hooks (useState, useContext)
3. **Form State**: React Hook Form with Zod validation
4. **Authentication**: Custom `useAuth` hook

### File Upload Workflow
1. Request upload URL from `/api/documents/upload`
2. Upload file directly to Google Cloud Storage
3. Process document with AI via `/api/documents/process`
4. Create loan from extracted data via `/api/loans/create-from-document`

### Environment Setup
Required environment variables:
- `DATABASE_URL`: PostgreSQL connection string
- `SESSION_SECRET`: Session encryption key
- `OPENAI_API_KEY`: For AI document processing
- `GOOGLE_CLOUD_*`: Google Cloud Storage credentials

### Development Best Practices
1. **Type Safety**: Use TypeScript throughout
2. **Validation**: Zod schemas for runtime validation
3. **Error Handling**: Comprehensive try-catch blocks
4. **Security**: Proper authentication and authorization
5. **Performance**: Query optimization and caching
6. **Accessibility**: shadcn/ui components provide accessibility
7. **Responsive Design**: Mobile-first Tailwind CSS approach

### Deployment Considerations
- Designed for Replit deployment
- Uses Neon PostgreSQL with connection pooling
- Environment-based configuration
- Production build optimization with Vite and esbuild
- Session persistence across deployments

### AI Integration Points
- Document processing for loan term extraction
- Interest rate suggestions based on relationship and amount
- Automated statement generation with intelligent formatting
- Future: Enhanced AI features for payment reminders and insights

This codebase represents a sophisticated personal lending platform with modern full-stack architecture, comprehensive feature set, and strong emphasis on user experience and legal compliance.