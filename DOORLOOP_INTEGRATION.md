# DoorLoop Integration - Complete Guide

## Overview

ChittyFinance now has **full integration** with DoorLoop property management system, providing:
- Automatic daily synchronization of rent payments and expenses
- Real-time access to property data, leases, and payments
- Integration with the automated bookkeeping workflow
- Dedicated API endpoint for City Studio monitoring

## Setup

### 1. Get Your DoorLoop API Key

1. Log in to DoorLoop: https://app.doorloop.com
2. Navigate to **Settings → API**
3. Copy your API key

### 2. Store API Key Securely

**Using 1Password (Recommended)**:
```bash
# Store in 1Password
op item create \
  --category="API Credential" \
  --title="DOORLOOP_API_KEY" \
  --vault="Claude-Code Tools" \
  api_key="your_actual_api_key"

# Reference in your environment
export DOORLOOP_API_KEY="op://Claude-Code Tools/DOORLOOP_API_KEY/api_key"
```

**Or set directly**:
```bash
export DOORLOOP_API_KEY="your_actual_api_key"
```

### 3. Create DoorLoop Integration in ChittyFinance

```bash
curl -X POST "http://localhost:5000/api/integrations" \
  -H "Authorization: Bearer YOUR_CHITTY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "service": "doorloop",
    "credentials": {
      "api_key": "your_actual_api_key"
    },
    "connected": true
  }'
```

## API Endpoints

### Test Connection

```bash
GET /api/doorloop/test
```

Tests the DoorLoop API connection and returns available data.

**Response**:
```json
{
  "connected": true,
  "properties": 2,
  "leases": 3,
  "paymentsAvailable": true
}
```

**Example**:
```bash
curl -X GET "http://localhost:5000/api/doorloop/test" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### Get All Properties

```bash
GET /api/doorloop/properties
```

Fetches all properties from DoorLoop.

**Response**:
```json
[
  {
    "id": 12345,
    "name": "City Studio",
    "address": {
      "line1": "550 W Surf St Unit C211",
      "city": "Chicago",
      "state": "IL",
      "zip": "60657",
      "country": "USA",
      "full": "550 W Surf St Unit C211, Chicago, IL 60657"
    },
    "type": "Condo",
    "units": 1,
    "status": "Active",
    "createdAt": "2020-03-15T00:00:00Z"
  }
]
```

**Example**:
```bash
curl -X GET "http://localhost:5000/api/doorloop/properties" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### Get City Studio Details

```bash
GET /api/doorloop/city-studio
```

**Special endpoint** that finds City Studio property and returns complete details including leases and recent payments.

**Response**:
```json
{
  "property": {
    "id": 12345,
    "name": "City Studio",
    "address": {...}
  },
  "leases": [
    {
      "id": 67890,
      "tenant": {
        "id": 111,
        "name": "John Doe",
        "email": "john@example.com"
      },
      "startDate": "2024-01-01",
      "endDate": "2024-12-31",
      "monthlyRent": 2200.00,
      "status": "active"
    }
  ],
  "payments": [
    {
      "id": 98765,
      "leaseId": 67890,
      "amount": 2200.00,
      "date": "2024-12-01",
      "status": "cleared",
      "paymentMethod": "ACH"
    }
  ],
  "latestPayment": {
    "id": 98765,
    "amount": 2200.00,
    "date": "2024-12-01",
    "status": "cleared"
  }
}
```

**Example**:
```bash
curl -X GET "http://localhost:5000/api/doorloop/city-studio" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### Get Property Leases

```bash
GET /api/doorloop/properties/:propertyId/leases
```

Fetches all leases for a specific property.

**Example**:
```bash
curl -X GET "http://localhost:5000/api/doorloop/properties/12345/leases" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### Get Lease Payments

```bash
GET /api/doorloop/leases/:leaseId/payments
```

Fetches all payments for a specific lease.

**Response**:
```json
[
  {
    "id": 98765,
    "leaseId": 67890,
    "tenantId": 111,
    "amount": 2200.00,
    "date": "2024-12-01",
    "status": "cleared",
    "paymentMethod": "ACH",
    "memo": "December rent",
    "createdAt": "2024-12-01T10:00:00Z"
  }
]
```

**Example**:
```bash
curl -X GET "http://localhost:5000/api/doorloop/leases/67890/payments" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### Sync Property to ChittyFinance

```bash
POST /api/doorloop/properties/:propertyId/sync
```

Syncs rent payments and expenses for a property to ChittyFinance transactions.

**Request Body**:
```json
{
  "startDate": "2024-01-01"
}
```

**Response**:
```json
{
  "rentPayments": 12,
  "expenses": 8,
  "errors": []
}
```

**Example**:
```bash
curl -X POST "http://localhost:5000/api/doorloop/properties/12345/sync" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"startDate": "2024-01-01"}'
```

## Automated Daily Sync

DoorLoop is now integrated into the **daily bookkeeping workflow**. When you run:

```bash
POST /api/workflows/daily-bookkeeping
```

The workflow will:
1. ✅ Sync Wave invoices and expenses
2. ✅ **Sync DoorLoop properties (NEW!)**
   - Fetch all properties from DoorLoop
   - Sync rent payments from the last 7 days
   - Sync property expenses from the last 7 days
   - Deduplicate using `externalId`
3. ✅ Sync ChittyRental data (if applicable)
4. ✅ Auto-categorize transactions
5. ✅ Log to ChittyChronicle

**Response**:
```json
{
  "synced": {
    "wave": 5,
    "doorloop": 12,
    "rental": 0
  },
  "categorized": 15,
  "anomalies": 0
}
```

## Command Line Script

Use the dedicated script to check City Studio payments:

```bash
# Set API key
export DOORLOOP_API_KEY="your_api_key"

# Or use 1Password
export DOORLOOP_API_KEY="op://Claude-Code Tools/DOORLOOP_API_KEY/api_key"

# Run the script
tsx scripts/check-city-studio-payment.ts
```

**Output**:
```
🔍 Fetching DoorLoop data...

📋 Step 1: Fetching properties...
   Found 2 properties

✅ Found City Studio property:
   ID: 12345
   Name: City Studio
   Address: 550 W Surf St Unit C211, Chicago, IL 60657

📋 Step 2: Fetching leases...
   Found 1 lease(s) for City Studio

   Lease 1:
     ID: 67890
     Tenant: John Doe
     Status: active
     Monthly Rent: $2200.00

📋 Step 3: Fetching payments...
   Found 12 payment(s) for City Studio

💰 Recent Payments:
────────────────────────────────────────────────────────────────────────────────

1. Payment on 2024-12-01
   Amount: $2200.00
   Status: cleared
   Method: ACH

2. Payment on 2024-11-01
   Amount: $2200.00
   Status: cleared
   Method: ACH

────────────────────────────────────────────────────────────────────────────────

📊 Summary:
   Total Payments: 12
   Total Amount: $26400.00
   Latest Payment: $2200.00 on 2024-12-01
   Latest Status: cleared
```

## Integration Architecture

### DoorLoopClient Class

**Location**: `server/lib/doorloop-integration.ts`

**Key Methods**:
```typescript
class DoorLoopClient {
  // Data retrieval
  async getProperties(): Promise<DoorLoopProperty[]>
  async getProperty(id: number): Promise<DoorLoopProperty>
  async getLeases(): Promise<DoorLoopLease[]>
  async getPropertyLeases(propertyId: number): Promise<DoorLoopLease[]>
  async getPayments(): Promise<DoorLoopPayment[]>
  async getLeasePayments(leaseId: number): Promise<DoorLoopPayment[]>
  async getExpenses(): Promise<DoorLoopExpense[]>
  async getMaintenanceRequests(propertyId?: number): Promise<DoorLoopMaintenanceRequest[]>

  // Utilities
  async findPropertyByAddress(search: string): Promise<DoorLoopProperty | undefined>
  async testConnection(): Promise<{connected, properties, leases, paymentsAvailable}>

  // Sync to ChittyFinance
  async syncRentPayments(propertyId, tenantId, startDate?): Promise<{synced, errors}>
  async syncExpenses(propertyId, tenantId, startDate?): Promise<{synced, errors}>
  async syncProperty(propertyId, tenantId, startDate?): Promise<{rentPayments, expenses, errors}>
}
```

### Data Synchronization

When syncing DoorLoop data to ChittyFinance:

**Rent Payments** →  Transactions:
- Type: `income`
- Category: `rent_income`
- External ID: `doorloop-payment-{paymentId}`
- Metadata includes: `leaseId`, `paymentMethod`, `reference`

**Expenses** → Transactions:
- Type: `expense`
- Category: from DoorLoop category or `other_expense`
- External ID: `doorloop-expense-{expenseId}`
- Metadata includes: `expenseStatus`

**Deduplication**: Uses `externalId` to prevent duplicate syncs

## Premium Account Features

⚠️ **Note**: Some DoorLoop features require a premium account:

- ✅ **Available on Free Tier**:
  - Properties
  - Units
  - Leases
  - Basic property data

- 💎 **Premium Required**:
  - Payments API (may return HTML instead of JSON)
  - Advanced reporting
  - Bulk operations

If payments API is unavailable, the integration will:
1. Log a warning
2. Return empty array for payments
3. Continue syncing other data

## Troubleshooting

### API Key Issues

**Error**: `DoorLoop API error 401`

**Solution**:
```bash
# Verify your API key
echo $DOORLOOP_API_KEY

# Test connection
curl -H "Authorization: Bearer $DOORLOOP_API_KEY" \
  https://app.doorloop.com/api/properties?limit=1
```

### Payments Not Available

**Error**: `Payments endpoint returned HTML`

**Cause**: DoorLoop free tier doesn't include payments API access

**Solution**: Upgrade to DoorLoop premium or check payments manually at https://app.doorloop.com/payments

### City Studio Not Found

**Error**: `City Studio not found in DoorLoop`

**Cause**: Property address doesn't match search pattern

**Solution**:
1. Check property name in DoorLoop dashboard
2. Update search in `findPropertyByAddress()` method
3. Or use property ID directly

## Environment Variables

```bash
# Required
DOORLOOP_API_KEY=your_api_key

# Optional (for daily workflow automation)
CHITTYCHRONICLE_URL=https://chronicle.chitty.cc
CHITTYCHRONICLE_TOKEN=your_service_token
OPENAI_API_KEY=your_openai_key  # For ML categorization
```

## Next Steps

1. **Set up daily cron**:
   ```bash
   # Run daily at 2 AM
   0 2 * * * curl -X POST http://localhost:5000/api/workflows/daily-bookkeeping \
     -H "Authorization: Bearer $TOKEN"
   ```

2. **Monitor sync results** via ChittyChronicle:
   ```bash
   GET /api/events?eventType=integration_sync&entityId=your_tenant_id
   ```

3. **Build frontend UI** for DoorLoop data visualization

## File Reference

- `server/lib/doorloop-integration.ts` - Main integration module
- `server/lib/bookkeeping-workflows.ts` - Daily sync workflow (line 69-97)
- `server/routes.ts` - API endpoints (lines 1877-2035)
- `server/integrations/doorloopClient.ts` - Low-level API client
- `scripts/check-city-studio-payment.ts` - CLI utility

---

**Status**: ✅ Production Ready
**Last Updated**: December 9, 2024
**Integration**: DoorLoop API v1
