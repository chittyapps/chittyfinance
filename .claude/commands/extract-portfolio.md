# Extract Portfolio Summary

Extract comprehensive portfolio summary from TurboTenant for ARIBIA LLC properties.

## Start URL
https://rental.turbotenant.com/owners/dashboard

## Portfolio Metrics to Capture

### 1. Financial Overview
- Total monthly rent (all properties)
- Rent collected this month
- Outstanding balances
- Year-to-date income
- Year-to-date expenses
- Net operating income (NOI)

### 2. Occupancy Summary
- Total units: 4
- Occupied units
- Vacant units
- Occupancy rate percentage
- Average days vacant (last 12 months)

### 3. Property Performance
For each property:
- Property name and address
- Monthly rent amount
- Current status (occupied/vacant)
- Current tenant name
- Lease expiration date
- Days until lease expires
- Payment status (current/late)
- Outstanding balance

### 4. Cash Flow Analysis
- Gross scheduled rent
- Vacancy loss
- Effective gross income
- Operating expenses breakdown
- Net operating income
- Cash flow after debt service (if applicable)

### 5. Maintenance Overview
- Open maintenance requests (count)
- Pending requests
- In-progress requests
- Average resolution time (days)
- Maintenance costs MTD
- Maintenance costs YTD

### 6. Lease Expirations
- Leases expiring in 30 days
- Leases expiring in 60 days
- Leases expiring in 90 days
- Month-to-month leases

## Properties in Portfolio
| Property | Address | Type |
|----------|---------|------|
| Lakeside Loft | 541 W Addison St, Unit 3S, Chicago IL | Condo |
| Cozy Castle | 550 W Surf St, Unit 504, Chicago IL | Condo |
| City Studio | 550 W Surf St, Unit C211, Chicago IL | Condo |
| Morada Mami | Carrera 76 A # 53-215, Medellín | Apartment |

## Output Format

Save to `/home/user/chittyfinance/data/portfolio-summary.json`:

```json
{
  "extracted_at": "2025-01-14T00:00:00Z",
  "portfolio_name": "ARIBIA LLC",
  "financial_overview": {
    "total_monthly_rent": 0.00,
    "collected_this_month": 0.00,
    "outstanding_balance": 0.00,
    "ytd_income": 0.00,
    "ytd_expenses": 0.00,
    "ytd_noi": 0.00
  },
  "occupancy": {
    "total_units": 4,
    "occupied": 0,
    "vacant": 0,
    "occupancy_rate": "0%",
    "avg_days_vacant": 0
  },
  "properties": [
    {
      "name": "City Studio",
      "address": "550 W Surf St, Unit C211",
      "monthly_rent": 0.00,
      "status": "occupied",
      "tenant": "...",
      "lease_end": "YYYY-MM-DD",
      "days_until_expiry": 0,
      "payment_status": "current",
      "outstanding": 0.00
    }
  ],
  "cash_flow": {
    "gross_scheduled_rent": 0.00,
    "vacancy_loss": 0.00,
    "effective_gross_income": 0.00,
    "operating_expenses": 0.00,
    "noi": 0.00
  },
  "maintenance": {
    "open_requests": 0,
    "pending": 0,
    "in_progress": 0,
    "avg_resolution_days": 0,
    "costs_mtd": 0.00,
    "costs_ytd": 0.00
  },
  "lease_expirations": {
    "within_30_days": [],
    "within_60_days": [],
    "within_90_days": [],
    "month_to_month": []
  },
  "alerts": {
    "late_payments": [],
    "expiring_leases": [],
    "vacant_units": [],
    "open_maintenance": []
  }
}
```

## Navigation Steps

1. **Dashboard** - Capture top-level metrics and alerts
2. **Properties** - Click into each property for detailed metrics
3. **Accounting** → **Reports** - Get financial summaries
4. **Tenants** - Review tenant status and payment history
5. **Maintenance** - Check open tickets and costs
6. **Leases** - Review expiration dates

## Notes

- Wait for user authentication - do not enter credentials
- Calculate derived metrics (NOI, occupancy rate, etc.)
- Use `null` for unavailable fields
- Flag any concerning metrics (late payments, expiring leases, vacancies)
- Include comparison to previous month if available
