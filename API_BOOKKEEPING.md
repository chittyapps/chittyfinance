# ChittyFinance Bookkeeping API Documentation

This document provides comprehensive API documentation for the Wave Accounting, ChittyRental Property Management, and Automated Bookkeeping Workflow endpoints.

## Authentication

All endpoints require:
- **ChittyConnect Authentication**: Bearer token via `Authorization` header
- **Tenant Context**: Automatically resolved from authentication token

## Table of Contents

1. [Wave Bookkeeping API](#wave-bookkeeping-api)
2. [ChittyRental Property Management API](#chittyrental-property-management-api)
3. [Automated Bookkeeping Workflows](#automated-bookkeeping-workflows)

---

## Wave Bookkeeping API

### GET /api/wave/invoices

Fetch Wave invoices with optional filtering.

**Query Parameters:**
- `status` (optional): Filter by status (`DRAFT`, `SENT`, `VIEWED`, `PAID`, `OVERDUE`, `CANCELLED`)
- `startDate` (optional): ISO date string (YYYY-MM-DD)
- `endDate` (optional): ISO date string (YYYY-MM-DD)

**Response:**
```json
[
  {
    "id": "invoice_123",
    "invoiceNumber": "INV-001",
    "customerId": "customer_123",
    "customerName": "Acme Corp",
    "invoiceDate": "2024-01-15",
    "dueDate": "2024-02-15",
    "status": "PAID",
    "subtotal": 1000.00,
    "total": 1080.00,
    "amountDue": 0.00,
    "currency": "USD",
    "items": [
      {
        "description": "Consulting services",
        "quantity": 10,
        "unitPrice": 100.00,
        "total": 1000.00,
        "accountId": "account_123"
      }
    ],
    "taxes": [
      {
        "name": "Sales Tax",
        "rate": 0.08,
        "amount": 80.00
      }
    ],
    "payments": []
  }
]
```

**Example:**
```bash
curl -X GET "https://finance.chitty.cc/api/wave/invoices?status=PAID&startDate=2024-01-01&endDate=2024-12-31" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### POST /api/wave/invoices

Create a new Wave invoice.

**Request Body:**
```json
{
  "customerId": "customer_123",
  "invoiceDate": "2024-12-09",
  "dueDate": "2025-01-09",
  "items": [
    {
      "productId": "product_123",
      "description": "Web development services",
      "quantity": 20,
      "unitPrice": 150.00,
      "accountId": "account_income_123",
      "taxIds": ["tax_123"]
    }
  ],
  "memo": "December 2024 invoice"
}
```

**Response:**
```json
{
  "id": "invoice_456",
  "invoiceNumber": "INV-002",
  "status": "DRAFT",
  "total": 3240.00
}
```

**Example:**
```bash
curl -X POST "https://finance.chitty.cc/api/wave/invoices" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "customer_123",
    "invoiceDate": "2024-12-09",
    "dueDate": "2025-01-09",
    "items": [{"description": "Services", "quantity": 1, "unitPrice": 1000}]
  }'
```

---

### POST /api/wave/invoices/:invoiceId/payments

Record a payment for an invoice.

**URL Parameters:**
- `invoiceId`: Wave invoice ID

**Request Body:**
```json
{
  "amount": 1080.00,
  "date": "2024-12-09",
  "paymentMethod": "ACH",
  "memo": "Payment received via bank transfer"
}
```

**Response:**
```json
{
  "id": "payment_789",
  "amount": 1080.00,
  "date": "2024-12-09",
  "paymentMethod": "ACH",
  "invoiceId": "invoice_123",
  "memo": "Payment received via bank transfer"
}
```

**Example:**
```bash
curl -X POST "https://finance.chitty.cc/api/wave/invoices/invoice_123/payments" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount": 1080.00, "date": "2024-12-09", "paymentMethod": "ACH"}'
```

---

### GET /api/wave/customers

Fetch all Wave customers for the business.

**Response:**
```json
[
  {
    "id": "customer_123",
    "name": "Acme Corporation",
    "email": "accounting@acme.com",
    "phone": "+1-555-0100",
    "address": {
      "line1": "123 Main St",
      "line2": "Suite 100",
      "city": "San Francisco",
      "state": "California",
      "zip": "94102",
      "country": "United States"
    },
    "balance": 0.00,
    "currency": "USD"
  }
]
```

**Example:**
```bash
curl -X GET "https://finance.chitty.cc/api/wave/customers" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### GET /api/wave/reports/profit-loss

Generate Profit & Loss report for a date range.

**Query Parameters:**
- `startDate` (required): ISO date string (YYYY-MM-DD)
- `endDate` (required): ISO date string (YYYY-MM-DD)

**Response:**
```json
{
  "revenue": 50000.00,
  "expenses": 30000.00,
  "netIncome": 20000.00,
  "breakdown": [
    {"category": "Consulting Revenue", "amount": 30000.00},
    {"category": "Product Sales", "amount": 20000.00},
    {"category": "Office Rent", "amount": -5000.00},
    {"category": "Salaries", "amount": -25000.00}
  ]
}
```

**Example:**
```bash
curl -X GET "https://finance.chitty.cc/api/wave/reports/profit-loss?startDate=2024-01-01&endDate=2024-12-31" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### POST /api/wave/sync

Sync Wave invoices and expenses to ChittyFinance transactions.

**Response:**
```json
{
  "invoices": 15,
  "expenses": 23,
  "customers": 0,
  "vendors": 0
}
```

**Example:**
```bash
curl -X POST "https://finance.chitty.cc/api/wave/sync" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## ChittyRental Property Management API

### GET /api/rental/properties

Fetch all rental properties for the tenant.

**Response:**
```json
[
  {
    "id": "property_123",
    "tenantId": "tenant_aribia_mgmt",
    "name": "City Studio",
    "address": {
      "street": "550 W Surf St, Unit C211",
      "city": "Chicago",
      "state": "IL",
      "zip": "60657"
    },
    "type": "condo",
    "units": 1,
    "purchasePrice": 200000.00,
    "purchaseDate": "2020-03-15",
    "marketValue": 250000.00,
    "mortgageBalance": 150000.00,
    "monthlyMortgage": 1200.00
  }
]
```

**Example:**
```bash
curl -X GET "https://finance.chitty.cc/api/rental/properties" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### GET /api/rental/properties/:propertyId

Fetch detailed property information.

**URL Parameters:**
- `propertyId`: Property ID

**Response:** Same as property object in list endpoint

**Example:**
```bash
curl -X GET "https://finance.chitty.cc/api/rental/properties/property_123" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### GET /api/rental/properties/:propertyId/units

Fetch all units for a property.

**Response:**
```json
[
  {
    "id": "unit_123",
    "propertyId": "property_123",
    "unitNumber": "C211",
    "bedrooms": 1,
    "bathrooms": 1,
    "sqft": 650,
    "monthlyRent": 2200.00,
    "securityDeposit": 2200.00,
    "status": "occupied",
    "currentLeaseId": "lease_456"
  }
]
```

**Example:**
```bash
curl -X GET "https://finance.chitty.cc/api/rental/properties/property_123/units" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### GET /api/rental/properties/:propertyId/leases

Fetch leases for a property.

**Query Parameters:**
- `status` (optional): Filter by status (`active`, `expired`, `terminated`, `pending`)

**Response:**
```json
[
  {
    "id": "lease_456",
    "unitId": "unit_123",
    "tenantId": "tenant_john_doe",
    "tenantName": "John Doe",
    "tenantEmail": "john@example.com",
    "tenantPhone": "+1-555-0123",
    "startDate": "2024-01-01",
    "endDate": "2024-12-31",
    "monthlyRent": 2200.00,
    "securityDeposit": 2200.00,
    "status": "active",
    "paymentDay": 1,
    "autoPayEnabled": true
  }
]
```

**Example:**
```bash
curl -X GET "https://finance.chitty.cc/api/rental/properties/property_123/leases?status=active" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### GET /api/rental/leases/:leaseId/payments

Fetch rent payments for a lease.

**Query Parameters:**
- `startDate` (optional): ISO date string
- `endDate` (optional): ISO date string

**Response:**
```json
[
  {
    "id": "payment_789",
    "leaseId": "lease_456",
    "amount": 2200.00,
    "dueDate": "2024-12-01",
    "paidDate": "2024-12-01",
    "status": "paid",
    "paymentMethod": "ach",
    "lateFee": 0.00,
    "memo": "December rent"
  }
]
```

**Example:**
```bash
curl -X GET "https://finance.chitty.cc/api/rental/leases/lease_456/payments?startDate=2024-01-01&endDate=2024-12-31" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### POST /api/rental/leases/:leaseId/payments

Record a rent payment.

**Request Body:**
```json
{
  "amount": 2200.00,
  "paidDate": "2024-12-01",
  "paymentMethod": "ach",
  "memo": "December rent payment"
}
```

**Response:**
```json
{
  "id": "payment_789",
  "leaseId": "lease_456",
  "amount": 2200.00,
  "dueDate": "2024-12-01",
  "paidDate": "2024-12-01",
  "status": "paid",
  "paymentMethod": "ach"
}
```

**Example:**
```bash
curl -X POST "https://finance.chitty.cc/api/rental/leases/lease_456/payments" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount": 2200.00, "paidDate": "2024-12-01", "paymentMethod": "ach"}'
```

---

### GET /api/rental/properties/:propertyId/maintenance

Fetch maintenance requests for a property.

**Query Parameters:**
- `status` (optional): Filter by status (`open`, `assigned`, `in_progress`, `completed`, `closed`)

**Response:**
```json
[
  {
    "id": "maint_123",
    "propertyId": "property_123",
    "unitId": "unit_123",
    "type": "plumbing",
    "priority": "high",
    "status": "open",
    "description": "Kitchen sink leak",
    "reportedBy": "tenant",
    "reportedDate": "2024-12-08",
    "estimatedCost": 250.00
  }
]
```

**Example:**
```bash
curl -X GET "https://finance.chitty.cc/api/rental/properties/property_123/maintenance?status=open" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### POST /api/rental/maintenance

Create a new maintenance request.

**Request Body:**
```json
{
  "propertyId": "property_123",
  "unitId": "unit_123",
  "type": "hvac",
  "priority": "medium",
  "description": "AC not cooling properly",
  "reportedBy": "tenant"
}
```

**Response:**
```json
{
  "id": "maint_456",
  "propertyId": "property_123",
  "unitId": "unit_123",
  "type": "hvac",
  "priority": "medium",
  "status": "open",
  "description": "AC not cooling properly",
  "reportedBy": "tenant",
  "reportedDate": "2024-12-09"
}
```

**Example:**
```bash
curl -X POST "https://finance.chitty.cc/api/rental/maintenance" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"propertyId": "property_123", "type": "hvac", "priority": "medium", "description": "AC issue", "reportedBy": "tenant"}'
```

---

### GET /api/rental/properties/:propertyId/expenses

Fetch property expenses.

**Query Parameters:**
- `startDate` (optional): ISO date string
- `endDate` (optional): ISO date string

**Response:**
```json
[
  {
    "id": "expense_789",
    "propertyId": "property_123",
    "date": "2024-12-05",
    "category": "maintenance",
    "amount": 250.00,
    "vendor": "ABC Plumbing",
    "description": "Fixed kitchen sink leak",
    "maintenanceRequestId": "maint_123",
    "receiptUrl": "https://..."
  }
]
```

**Example:**
```bash
curl -X GET "https://finance.chitty.cc/api/rental/properties/property_123/expenses?startDate=2024-01-01&endDate=2024-12-31" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### POST /api/rental/expenses

Record a property expense.

**Request Body:**
```json
{
  "propertyId": "property_123",
  "date": "2024-12-09",
  "category": "repair",
  "amount": 350.00,
  "vendor": "XYZ Repairs",
  "description": "HVAC repair",
  "maintenanceRequestId": "maint_456"
}
```

**Response:**
```json
{
  "id": "expense_890",
  "propertyId": "property_123",
  "date": "2024-12-09",
  "category": "repair",
  "amount": 350.00,
  "vendor": "XYZ Repairs",
  "description": "HVAC repair"
}
```

**Example:**
```bash
curl -X POST "https://finance.chitty.cc/api/rental/expenses" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"propertyId": "property_123", "category": "repair", "amount": 350, "vendor": "XYZ", "description": "HVAC repair"}'
```

---

### GET /api/rental/properties/:propertyId/rent-roll

Fetch current rent roll for a property.

**Response:**
```json
{
  "propertyId": "property_123",
  "propertyName": "City Studio",
  "totalUnits": 1,
  "occupiedUnits": 1,
  "vacantUnits": 0,
  "occupancyRate": 100.0,
  "totalMonthlyRent": 2200.00,
  "collectedRent": 2200.00,
  "outstandingRent": 0.00,
  "units": [
    {
      "unitNumber": "C211",
      "tenant": "John Doe",
      "rent": 2200.00,
      "leaseEnd": "2024-12-31",
      "status": "active"
    }
  ]
}
```

**Example:**
```bash
curl -X GET "https://finance.chitty.cc/api/rental/properties/property_123/rent-roll" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### GET /api/rental/properties/:propertyId/financials

Fetch property financial summary for a date range.

**Query Parameters:**
- `startDate` (required): ISO date string
- `endDate` (required): ISO date string

**Response:**
```json
{
  "propertyId": "property_123",
  "period": {
    "start": "2024-01-01",
    "end": "2024-12-31"
  },
  "income": {
    "rent": 26400.00,
    "lateFees": 0.00,
    "other": 0.00,
    "total": 26400.00
  },
  "expenses": {
    "mortgage": 14400.00,
    "maintenance": 1500.00,
    "utilities": 0.00,
    "insurance": 1200.00,
    "propertyTax": 2500.00,
    "hoa": 3000.00,
    "management": 0.00,
    "other": 500.00,
    "total": 23100.00
  },
  "netOperatingIncome": 3300.00,
  "cashFlow": 3300.00,
  "capRate": 1.32,
  "roi": 1.65
}
```

**Example:**
```bash
curl -X GET "https://finance.chitty.cc/api/rental/properties/property_123/financials?startDate=2024-01-01&endDate=2024-12-31" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### GET /api/rental/financials/consolidated

Fetch consolidated financials for all properties.

**Query Parameters:**
- `startDate` (required): ISO date string
- `endDate` (required): ISO date string

**Response:**
```json
{
  "properties": [
    { /* Property 1 financials */ },
    { /* Property 2 financials */ }
  ],
  "totals": {
    "income": 52800.00,
    "expenses": 46200.00,
    "netIncome": 6600.00,
    "cashFlow": 6600.00,
    "avgOccupancy": 95.0
  }
}
```

**Example:**
```bash
curl -X GET "https://finance.chitty.cc/api/rental/financials/consolidated?startDate=2024-01-01&endDate=2024-12-31" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### POST /api/rental/properties/:propertyId/sync

Sync property rent payments and expenses to ChittyFinance.

**Request Body:**
```json
{
  "startDate": "2024-01-01"
}
```

**Response:**
```json
{
  "rentPayments": 12,
  "expenses": 8,
  "errors": []
}
```

**Example:**
```bash
curl -X POST "https://finance.chitty.cc/api/rental/properties/property_123/sync" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"startDate": "2024-01-01"}'
```

---

## Automated Bookkeeping Workflows

### POST /api/workflows/daily-bookkeeping

Run the daily bookkeeping workflow for the tenant.

**Workflow Actions:**
1. Sync Wave invoices and expenses
2. Sync rental property data
3. Categorize uncategorized transactions (up to 50)
4. Detect anomalies and suspicious activity
5. Log workflow completion to ChittyChronicle

**Response:**
```json
{
  "synced": {
    "wave": 5,
    "rental": 3
  },
  "categorized": 12,
  "anomalies": 0
}
```

**Example:**
```bash
curl -X POST "https://finance.chitty.cc/api/workflows/daily-bookkeeping" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### POST /api/workflows/weekly-reconciliation

Run the weekly reconciliation workflow.

**Workflow Actions:**
1. Reconcile all accounts
2. Generate discrepancy reports
3. Log unreconciled items
4. Log workflow completion to ChittyChronicle

**Response:**
```json
{
  "accounts": 4,
  "reconciled": 127,
  "discrepancies": 3
}
```

**Example:**
```bash
curl -X POST "https://finance.chitty.cc/api/workflows/weekly-reconciliation" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### POST /api/workflows/monthly-close

Run the monthly financial close workflow.

**Request Body:**
```json
{
  "month": 12,
  "year": 2024
}
```

**Workflow Actions:**
1. Generate Profit & Loss statement
2. Calculate Balance Sheet
3. Prepare tax summary
4. Close the period
5. Archive transactions
6. Log workflow completion to ChittyChronicle

**Response:**
```json
{
  "profitLoss": {
    "revenue": 50000.00,
    "expenses": 35000.00,
    "netIncome": 15000.00
  },
  "balanceSheet": {
    "assets": 500000.00,
    "liabilities": 200000.00,
    "equity": 300000.00
  },
  "taxSummary": {
    "income": 50000.00,
    "deductions": 35000.00,
    "salesTax": 0.00
  }
}
```

**Example:**
```bash
curl -X POST "https://finance.chitty.cc/api/workflows/monthly-close" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"month": 12, "year": 2024}'
```

---

### POST /api/workflows/quarterly-tax-prep

Run the quarterly tax preparation workflow.

**Request Body:**
```json
{
  "quarter": 4,
  "year": 2024
}
```

**Workflow Actions:**
1. Calculate quarterly income and expenses
2. Generate deductions by category
3. Calculate estimated tax payments
4. Prepare for tax filing
5. Log workflow completion to ChittyChronicle

**Response:**
```json
{
  "income": 150000.00,
  "expenses": 100000.00,
  "netIncome": 50000.00,
  "estimatedTax": 12500.00,
  "deductions": [
    {"category": "office_rent", "amount": 15000.00},
    {"category": "software", "amount": 5000.00},
    {"category": "professional_services", "amount": 10000.00}
  ]
}
```

**Example:**
```bash
curl -X POST "https://finance.chitty.cc/api/workflows/quarterly-tax-prep" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"quarter": 4, "year": 2024}'
```

---

### POST /api/workflows/year-end-close

Run the annual year-end close workflow.

**Request Body:**
```json
{
  "year": 2024
}
```

**Workflow Actions:**
1. Generate annual financial statements
2. Calculate full-year metrics
3. Prepare for tax filing
4. Archive year data
5. Generate audit reports
6. Log workflow completion to ChittyChronicle

**Response:**
```json
{
  "annual": {
    "revenue": 600000.00,
    "expenses": 400000.00,
    "netIncome": 200000.00
  },
  "tax": {
    "taxableIncome": 600000.00,
    "deductions": 400000.00,
    "estimatedTax": 50000.00
  },
  "metrics": {
    "avgMonthlyRevenue": 50000.00,
    "avgMonthlyExpenses": 33333.33,
    "profitMargin": 33.33
  }
}
```

**Example:**
```bash
curl -X POST "https://finance.chitty.cc/api/workflows/year-end-close" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"year": 2024}'
```

---

## Error Responses

All endpoints return standard HTTP status codes and error responses:

**400 Bad Request:**
```json
{
  "error": "Validation error",
  "message": "month and year required"
}
```

**401 Unauthorized:**
```json
{
  "error": "Unauthorized",
  "message": "Invalid or expired token"
}
```

**404 Not Found:**
```json
{
  "error": "Integration not connected",
  "message": "Wave integration not connected"
}
```

**500 Internal Server Error:**
```json
{
  "error": "Sync failed",
  "message": "Failed to connect to Wave API: Connection timeout"
}
```

---

## Rate Limits

- **API Rate Limit**: 100 requests per minute per tenant
- **Integration Rate Limit**: 30 requests per minute per integration per tenant
- **Circuit Breaker**: Opens after 5 consecutive failures, closes after 60 seconds

---

## Best Practices

1. **Sync Workflows**: Run daily/weekly workflows via cron or scheduled tasks
2. **Error Handling**: Always check response status and handle errors gracefully
3. **Date Ranges**: Use ISO 8601 format (YYYY-MM-DD) for all date parameters
4. **Pagination**: Some endpoints may add pagination in future versions
5. **Idempotency**: All sync operations are idempotent (check for duplicates)
6. **Audit Trail**: All operations are logged to ChittyChronicle for audit purposes

---

## Environment Variables

Required environment variables for bookkeeping integrations:

```bash
# Wave Accounting
WAVE_CLIENT_ID=your_wave_client_id
WAVE_CLIENT_SECRET=your_wave_client_secret
WAVE_REDIRECT_URI=https://finance.chitty.cc/api/integrations/wave/callback

# ChittyRental
CHITTYRENTAL_URL=https://rental.chitty.cc
CHITTYRENTAL_TOKEN=your_service_token

# ChittyChronicle (Audit Logging)
CHITTYCHRONICLE_URL=https://chronicle.chitty.cc
CHITTYCHRONICLE_TOKEN=your_service_token

# OpenAI (ML Categorization)
OPENAI_API_KEY=your_openai_api_key
```

---

## Support

For questions or issues with the Bookkeeping API:
- Documentation: https://docs.chitty.cc/chittyfinance/bookkeeping
- Support: support@chitty.cc
- GitHub: https://github.com/chittyos/chittyfinance/issues
