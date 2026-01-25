# Universal Connector API Documentation

The Chitty Services CFO Platform provides a Universal Connector API endpoint that standardizes financial data from various connected platforms into a consistent format. This enables seamless integration with external applications and services.

## Endpoints

### Public Endpoint (No Authentication)

```
GET /api/universal-connector
```

This endpoint provides access to financial data without requiring authentication. It's useful for development and testing purposes.

### Authenticated Endpoint

```
GET /api/universal-connector/secured
```

This endpoint requires Replit Auth authentication. It provides the same data as the public endpoint but includes additional authentication information.

## Response Format

The Universal Connector API returns data in the following format:

```json
{
  "version": "1.0",
  "timestamp": "2025-05-08T12:34:56.789Z",
  "source": "ChittyServices-CFO",
  "accountId": 1,
  "authInfo": {
    "authenticatedUserId": "12345",
    "authenticatedAt": "2025-05-08T12:34:56.789Z",
    "authMethod": "replit_auth"
  },
  "data": {
    "summary": {
      "cashOnHand": 539044.05,
      "monthlyRevenue": 245893.00,
      "monthlyExpenses": 157663.05,
      "outstandingInvoices": 60000.25,
      "metrics": {
        "cashflow": 97650.50,
        "runway": 5.02,
        "burnRate": 108401.50,
        "growthRate": 12.50,
        "customerAcquisitionCost": 125.30,
        "lifetimeValue": 950.75
      }
    },
    "transactions": [
      {
        "id": "stripe-1",
        "title": "Subscription Payment",
        "description": "Monthly subscription payment",
        "amount": 49.99,
        "type": "income",
        "date": "2025-05-07T10:00:00.000Z",
        "category": "Subscription",
        "status": "completed",
        "paymentMethod": "credit_card",
        "source": "stripe"
      }
    ],
    "recurringCharges": [
      {
        "id": "merc-charge-1",
        "merchantName": "Adobe Creative Cloud",
        "amount": 52.99,
        "date": "2025-04-23T17:58:27.917Z",
        "category": "Software",
        "recurring": true,
        "nextChargeDate": "2025-05-23T17:58:27.917Z",
        "subscriptionId": "adobe-sub-123",
        "source": "mercury_bank"
      }
    ],
    "optimizations": [
      {
        "chargeId": "merc-charge-1",
        "merchantName": "Adobe Creative Cloud",
        "currentAmount": 52.99,
        "suggestedAction": "downgrade",
        "potentialSavings": 20.00,
        "reasoning": "You're not using all features of the full Creative Cloud suite. Consider downgrading to the Photography plan.",
        "alternativeOptions": ["Photography Plan ($9.99/mo)", "Single App ($20.99/mo)"]
      }
    ],
    "payroll": {
      "totalEmployees": 25,
      "payrollAmount": 75000.00,
      "nextPayrollDate": "2025-05-15T00:00:00.000Z",
      "taxes": {
        "federal": 15000.00,
        "state": 5000.00,
        "local": 2000.00
      }
    }
  },
  "connectedServices": [
    {
      "id": "1",
      "name": "Mercury Bank",
      "type": "mercury_bank",
      "lastSynced": "2025-05-08T08:40:24.088Z"
    },
    {
      "id": "5",
      "name": "Stripe",
      "type": "stripe",
      "lastSynced": "2025-05-08T08:40:24.088Z"
    }
  ]
}
```

## Field Descriptions

### Top-Level Fields

- `version`: The version of the Universal Connector API format (currently "1.0")
- `timestamp`: ISO 8601 timestamp of when the response was generated
- `source`: Identifier for the source system ("ChittyServices-CFO")
- `accountId`: Unique identifier for the account in the source system
- `authInfo`: (Only in authenticated endpoint) Information about the authenticated user
- `data`: Contains all financial data
- `connectedServices`: List of all connected financial services

### Data Fields

#### Summary

- `cashOnHand`: Current available cash
- `monthlyRevenue`: Average monthly revenue
- `monthlyExpenses`: Average monthly expenses
- `outstandingInvoices`: Total value of unpaid invoices
- `metrics`: Key financial metrics
  - `cashflow`: Net cash flow (income minus expenses)
  - `runway`: Number of months until cash runs out at current burn rate
  - `burnRate`: Monthly cash burn rate
  - `growthRate`: Percentage revenue growth rate
  - `customerAcquisitionCost`: Average cost to acquire a new customer
  - `lifetimeValue`: Average lifetime value of a customer

#### Transactions

Array of financial transactions with the following fields:
- `id`: Unique transaction identifier
- `title`: Transaction title/name
- `description`: Detailed description
- `amount`: Transaction amount
- `type`: Transaction type ("income" or "expense")
- `date`: ISO 8601 timestamp of the transaction
- `category`: Transaction category
- `status`: Transaction status (e.g., "pending" or "completed")
- `paymentMethod`: Method of payment
- `source`: Source financial platform

#### Recurring Charges

Array of recurring subscription charges with the following fields:
- `id`: Unique charge identifier
- `merchantName`: Name of the merchant/vendor
- `amount`: Charge amount
- `date`: ISO 8601 timestamp of the most recent charge
- `category`: Charge category
- `recurring`: Boolean indicating if this is a recurring charge
- `nextChargeDate`: ISO 8601 timestamp of the next expected charge date
- `subscriptionId`: Subscription identifier (if available)
- `source`: Source financial platform

#### Optimizations

Array of suggested optimizations for recurring charges:
- `chargeId`: Identifier of the charge to optimize
- `merchantName`: Name of the merchant/vendor
- `currentAmount`: Current charge amount
- `suggestedAction`: Recommended action ("cancel", "downgrade", "consolidate", or "negotiate")
- `potentialSavings`: Estimated monthly savings
- `reasoning`: Explanation for the recommendation
- `alternativeOptions`: Array of alternative options (if available)

#### Payroll

Payroll information with the following fields:
- `totalEmployees`: Number of employees
- `payrollAmount`: Total payroll amount
- `nextPayrollDate`: ISO 8601 timestamp of the next payroll date
- `taxes`: Breakdown of payroll taxes
  - `federal`: Federal tax amount
  - `state`: State tax amount
  - `local`: Local tax amount

### Connected Services

Array of connected financial platforms with the following fields:
- `id`: Service identifier
- `name`: Display name of the service
- `type`: Service type identifier
- `lastSynced`: ISO 8601 timestamp of when the service was last synced

## Source Identifiers

The following source identifiers are used in the response:

- `mercury_bank`: Mercury Bank (business banking)
- `wavapps`: WavApps (accounting)
- `doorloop`: DoorLoop (property management)
- `stripe`: Stripe (payment processing)
- `quickbooks`: QuickBooks (accounting)
- `xero`: Xero (international accounting)
- `brex`: Brex (business credit cards & expense management)
- `gusto`: Gusto (payroll & HR)

## Error Responses

If an error occurs, the API will return a JSON object with the following structure:

```json
{
  "success": false,
  "message": "Error message describing what went wrong"
}
```

Common error responses:

- `404 Not Found`: User not found
- `500 Internal Server Error`: Error generating universal connector data