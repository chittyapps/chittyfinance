# Chitty Services CFO Platform

## Overview

The Chitty Services CFO Platform is an AI-powered financial management dashboard that aggregates data from multiple financial service integrations (Mercury Bank, Wave Apps, Stripe, QuickBooks, etc.) and provides intelligent insights through an AI CFO assistant. The platform offers a comprehensive view of financial health, automated charge management, and data-driven recommendations for business optimization.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui component library
- **State Management**: TanStack Query for server state management
- **Routing**: Wouter for client-side routing
- **Authentication**: Replit Auth integration with session management
- **Build Tool**: Vite with custom plugins for theme management and error overlay

### Backend Architecture
- **Runtime**: Node.js 20 with Express.js
- **Language**: TypeScript with ES modules
- **API Design**: RESTful endpoints with structured error handling
- **Session Management**: express-session with PostgreSQL store
- **Authentication**: OpenID Connect (OIDC) with Replit Auth strategy

### Database Architecture
- **Primary Database**: PostgreSQL 16 with Neon serverless connection
- **ORM**: Drizzle ORM with schema-first approach
- **Migration Strategy**: Drizzle Kit for schema management
- **Connection Pooling**: Neon serverless with WebSocket support

## Key Components

### Authentication System
- **Provider**: Replit Auth using OpenID Connect
- **Session Storage**: PostgreSQL-backed sessions with 7-day TTL
- **User Management**: Custom user model with Replit auth data integration
- **Security**: Secure cookies with httpOnly and secure flags

### Financial Data Integration
- **Universal Connector**: Standardized API endpoint for financial data aggregation
- **Service Integrations**: Mercury Bank, Wave Apps, Stripe, QuickBooks, Xero, Brex, Gusto
- **Data Normalization**: Consistent format across all financial service providers
- **Real-time Sync**: Automated data synchronization with connected services

### AI Assistant
- **Provider**: OpenAI GPT-4o for financial analysis and recommendations
- **Capabilities**: Cash flow analysis, cost reduction planning, financial advisory
- **Context-aware**: Personalized recommendations based on company financial data
- **Interactive**: Chat-based interface for financial queries and insights

### Charge Automation
- **Recurring Charge Detection**: Automatic identification of subscription and recurring payments
- **Optimization Engine**: AI-powered recommendations for cost reduction
- **Management Actions**: Cancel, downgrade, consolidate, or negotiate charge options
- **Savings Tracking**: Potential and realized savings monitoring

## Data Flow

1. **Authentication Flow**: User authenticates via Replit Auth → Session created in PostgreSQL → User data stored/retrieved
2. **Financial Data Flow**: External APIs → Service-specific adapters → Universal Connector format → Database storage → Frontend display
3. **AI Analysis Flow**: Financial data → OpenAI API → AI insights → Database storage → Real-time updates to frontend
4. **Charge Management Flow**: Transaction data → Pattern recognition → Optimization recommendations → User actions → Service API calls

## External Dependencies

### Core Services
- **Database**: Neon PostgreSQL for primary data storage
- **Authentication**: Replit Auth for user authentication
- **AI Processing**: OpenAI API for financial analysis and recommendations

### Financial Service APIs
- **Mercury Bank**: Banking and transaction data
- **Wave Apps**: Accounting and invoice management
- **Stripe**: Payment processing data
- **QuickBooks**: Comprehensive accounting data
- **Xero**: International accounting platform
- **Brex**: Business credit and expense management
- **Gusto**: Payroll and HR data

### Development Tools
- **Build**: Vite for frontend bundling, esbuild for server bundling
- **Deployment**: Replit autoscale deployment target
- **Monitoring**: Built-in request logging and error tracking

## Deployment Strategy

### Production Environment
- **Platform**: Replit with autoscale deployment
- **Build Process**: Multi-stage build (frontend Vite build + server esbuild bundle)
- **Runtime**: Node.js production mode with optimized builds
- **Port Configuration**: Internal port 5000 mapped to external port 80

### Development Environment
- **Hot Reload**: Vite HMR for frontend, tsx for server development
- **Database**: Shared PostgreSQL instance with development schema
- **Environment Variables**: Comprehensive configuration for all service integrations
- **Static IP**: Configured for Mercury API whitelisting requirements

### Environment Configuration
- **Static IPs**: Pre-configured for Mercury Bank API access requirements
- **API Keys**: Secure storage of all financial service API credentials
- **Session Management**: Secure session configuration with appropriate timeouts
- **CORS**: Configured for Replit domain access patterns

## Changelog
- June 26, 2025. Initial setup

## User Preferences

Preferred communication style: Simple, everyday language.