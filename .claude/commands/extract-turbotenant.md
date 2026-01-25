# Extract TurboTenant Data

Extract all TurboTenant data for ARIBIA LLC properties. Navigate through each section and output structured JSON.

## Start URL
https://rental.turbotenant.com/owners/dashboard

## Properties to Extract
- Lakeside Loft (541 W Addison St, Unit 3S)
- Cozy Castle (550 W Surf St, Unit 504)
- City Studio (550 W Surf St, Unit C211)
- Morada Mami (Carrera 76 A # 53-215, Medellín)

## For Each Property Capture

1. **Property Status** - occupied/vacant
2. **Current Tenant** - name, email, phone
3. **Lease Details** - start date, end date, monthly rent
4. **Payment Status** - paid/due/late/partial
5. **Outstanding Balance** - amount owed
6. **Last Payment** - date and amount
7. **Maintenance Requests** - open tickets with status

## Also Extract

- **Dashboard Summary** - total rent due, collected, outstanding
- **Pending Applications** - applicant name, property, date applied
- **Recent Payments** - last 30 days, all properties
- **General Ledger** - all transactions for analysis

## Output Format

Save to `/home/user/chittyfinance/data/turbotenant-extract.json`:

```json
{
  "extracted_at": "2025-01-14T00:00:00Z",
  "properties": [
    {
      "name": "City Studio",
      "address": "550 W Surf St, Unit C211",
      "status": "occupied",
      "tenant": {
        "name": "...",
        "email": "...",
        "phone": "..."
      },
      "lease": {
        "start_date": "YYYY-MM-DD",
        "end_date": "YYYY-MM-DD",
        "monthly_rent": 0.00,
        "security_deposit": 0.00
      },
      "payment_status": "paid",
      "outstanding_balance": 0.00,
      "last_payment": {
        "date": "YYYY-MM-DD",
        "amount": 0.00
      },
      "maintenance_requests": []
    }
  ],
  "payments": [
    {
      "date": "YYYY-MM-DD",
      "property": "...",
      "tenant": "...",
      "amount": 0.00,
      "type": "rent",
      "status": "completed"
    }
  ],
  "applications": [
    {
      "applicant": "...",
      "property": "...",
      "applied_date": "YYYY-MM-DD",
      "status": "pending"
    }
  ],
  "ledger": [
    {
      "date": "YYYY-MM-DD",
      "description": "...",
      "account": "...",
      "debit": 0.00,
      "credit": 0.00,
      "property": "..."
    }
  ],
  "summary": {
    "total_rent_due": 0.00,
    "collected_this_month": 0.00,
    "outstanding": 0.00,
    "occupancy_rate": "100%"
  },
  "alerts": {
    "late_payments": [],
    "expiring_leases": [],
    "open_maintenance": []
  }
}
```

## Navigation Steps

1. **Dashboard** - Capture summary metrics
2. **Properties** → Click each property → Capture details
3. **Tenants** → View all tenants → Capture contact info
4. **Payments** → Recent payments → Capture last 30 days
5. **Applications** → Pending → Capture all
6. **Accounting** → General Ledger → Export all transactions
7. **Maintenance** → Open requests → Capture all

## After Extraction

Run analysis on the ledger data:
```bash
npx ts-node scripts/import-turbotenant.ts data/turbotenant-ledger.csv --analyze --output data/corrected-ledger.csv
```

## Notes

- Wait for user authentication - do not enter credentials
- Navigate pagination to get all records
- Use `null` for missing/unavailable fields
- Flag any late payments (>5 days overdue)
- Flag leases expiring within 60 days
- Save ledger separately as CSV for analysis tool
