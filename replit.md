# Close Lender - Personal Lending Platform

## Overview

Close Lender is a full-stack web application for managing personal loans between friends, family members, and community members. The platform provides professional loan management tools with a focus on personal relationships rather than corporate lending. It features loan creation, payment tracking, timeline visualization, and communication tools.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

This is a monorepo application using a modern full-stack architecture with TypeScript throughout:

- **Frontend**: React with Vite, using Wouter for routing and TanStack Query for state management
- **Backend**: Express.js server with TypeScript
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Authentication**: Replit-based OIDC authentication with session management
- **Styling**: Tailwind CSS with shadcn/ui component library
- **File Storage**: Google Cloud Storage integration for document uploads

## Key Components

### Frontend Architecture
- **Component Library**: shadcn/ui with Radix UI primitives for accessible components
- **State Management**: TanStack Query for server state, React hooks for local state
- **Routing**: Wouter for client-side routing with authentication guards
- **Forms**: React Hook Form with Zod validation for type-safe form handling
- **Styling**: Tailwind CSS with custom design tokens and glass morphism effects

### Backend Architecture
- **API Layer**: RESTful Express.js routes with TypeScript
- **Authentication**: Replit OIDC with Passport.js strategy and session storage
- **Database Layer**: Drizzle ORM with PostgreSQL for relational data modeling
- **Storage Layer**: Abstracted storage interface for database operations
- **File Handling**: Google Cloud Storage integration for document uploads

### Database Schema
The application uses a relational database with the following key entities:
- **Users**: Authentication and profile information
- **Loans**: Core loan data with status tracking and relationships
- **Payments**: Payment history with validation and status tracking
- **Timeline Events**: Comprehensive activity logging for all loan-related actions
- **Communications**: Message threads between loan participants
- **Documents**: File attachments with cloud storage references
- **Sessions**: Server-side session storage for authentication

## Data Flow

1. **Authentication Flow**: Users authenticate via Replit OIDC, sessions are stored in PostgreSQL
2. **Loan Creation**: Multi-step form with interest rate suggestions and borrower validation
3. **Payment Processing**: Payment recording with automatic timeline event creation
4. **Real-time Updates**: TanStack Query provides optimistic updates and cache invalidation
5. **Document Upload**: Files are uploaded to Google Cloud Storage with metadata stored in PostgreSQL
6. **Communication**: In-app messaging system with loan context preservation

## External Dependencies

### Core Dependencies
- **@neondatabase/serverless**: PostgreSQL connection pooling for serverless environments
- **@google-cloud/storage**: Cloud file storage integration
- **@tanstack/react-query**: Server state management and caching
- **@radix-ui/***: Accessible UI primitive components
- **drizzle-orm**: Type-safe database ORM with PostgreSQL dialect
- **passport**: Authentication middleware with OIDC strategy

### Development Tools
- **Vite**: Fast development server and build tool with React plugin
- **TypeScript**: Type safety across frontend and backend
- **Tailwind CSS**: Utility-first CSS framework
- **Zod**: Runtime type validation for forms and API responses

## Deployment Strategy

The application is designed for deployment on Replit with the following considerations:

1. **Database**: Uses Neon PostgreSQL with connection pooling for serverless compatibility
2. **File Storage**: Google Cloud Storage for scalable file handling
3. **Authentication**: Integrated with Replit's OIDC for seamless user management
4. **Build Process**: Vite builds the frontend, esbuild bundles the backend for production
5. **Environment Variables**: Requires DATABASE_URL, SESSION_SECRET, and Google Cloud credentials
6. **Session Storage**: PostgreSQL-backed sessions for persistence across deployments

The application follows a monorepo structure with shared types between client and server, enabling type safety across the full stack while maintaining clear separation of concerns.

## Recent Changes (January 31, 2025)

### Dynamic Naming System Implementation
- Added `creditorTerm` and `debtorTerm` columns to users table with defaults "Lender" and "Borrower"
- Created `useDynamicTerms` hook for customizable terminology throughout the app
- Users can now customize how they refer to money providers (Lender/Creditor/Helper) and receivers (Borrower/Debtor/Friend)
- Updated Dashboard and other components to use dynamic terms instead of hardcoded "loan" language

### Seasonal Gamification Features
- Added `seasonalTheme` and `treeGrowthLevel` columns to users table
- Created `useSeasonalTheme` hook that provides seasonal colors, gradients, and tree growth visualization
- Implemented four seasons (spring, summer, fall, winter) with unique color schemes and motivational messages
- Tree growth system that visualizes payment performance with emoji progression (🌱 → 🌳 → 🌲⭐)
- App background and UI elements dynamically change based on user's selected season

### User Settings & Customization
- Built comprehensive Settings page (`/settings`) for term and seasonal preference management
- Created `SeasonalProgress` component showing tree growth and motivational messaging
- Added `LegalDisclaimer` component with clear disclaimers about not being a bank
- Implemented settings API route (`PUT /api/user/settings`) for preference updates

### Legal Compliance Features
- Added comprehensive legal disclaimers throughout the app
- Clear messaging that platform is not a bank with no loan guarantees
- Disclaimers about use at own risk and attorney consultation recommendations
- Premium feature callouts for certified mail, AI notices, and official registration

The app now provides a highly personalized experience where users can customize terminology to match their lending relationships (formal bank-style vs. family/friend casual) and enjoy seasonal gamification that rewards consistent payment behavior.