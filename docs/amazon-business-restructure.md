# Amazon Business Account Restructure

Configuration template for ARIBIA HOME RENTALS Amazon Business account.
Apply these settings in Amazon Business > Business Settings > Buying Policies.

## Account Groups

Replace the current 3-group setup with entity-aligned groups:

| Account Group | Purpose | Members |
|---|---|---|
| ARIBIA LLC - MGMT | Management company operations | Nick, Debbie |
| ARIBIA LLC - COZY CASTLE | 550 W Surf #504 property | Nick |
| ARIBIA LLC - CITY STUDIO | 550 W Surf #C211 property | Nick |
| ARIBIA LLC - APT ARLENE | 4343 N Clarendon #1610 property | Nick, Debbie |
| ARIBIA LLC - LAKESIDE LOFT | 541 W Addison #3S property | Nick |
| CHITTY SERVICES | ChittyCorp operational | Nick |
| Personal | Personal (non-deductible) | Nick |

Delete or archive: `ARIBIA LLC` (catch-all), `ARIBIA LLC's deleted child group`

## Cost Center Values

Property routing (dropdown, required on checkout):

- `COZY-CASTLE`
- `CITY-STUDIO`
- `APT-ARLENE`
- `LAKESIDE-LOFT`
- `GENERAL` (management/operational, no specific property)
- `PERSONAL` (non-deductible)

## GL Code Values

From the seeded Chart of Accounts (dropdown, required on checkout):

| GL Code | Name | When to use |
|---|---|---|
| 5020 | Cleaning & Janitorial | Cleaning supplies, trash bags, pest control |
| 5070 | Repairs & Maintenance | Hardware, plumbing, electrical, paint, locks |
| 5080 | Supplies | Tools, light bulbs, storage, office supplies |
| 7010 | HVAC Improvements | Heating/cooling equipment |
| 7030 | Appliances & CapEx | Appliances, furniture, major equipment (>$200) |
| 3200 | Owner Draws | Personal purchases on business card |
| 9010 | Suspense | Unsure (will be classified later) |

## Department Values

Expense categories (dropdown, optional):

- `Repairs`
- `Cleaning`
- `Supplies`
- `Capital Improvement`
- `Operations`
- `Furnishings`
- `Personal`

## Project Code Values

For renovation/project tracking (optional):

- `COZY-RENO-2024` (Cozy Castle renovation)
- `VILLA-VISTA-REMODEL`
- `APT-ARLENE-RENO`
- (add as needed)

## PO Number

Leave for actual purchase orders only. Stop using it for entity/category routing.

## What This Fixes

Before: PO Number did triple duty (property + entity + category), Account Groups were too broad (81% in one group), GL Code/Cost Center/Department were empty.

After: Each field has one purpose. Exports will map directly to ChittyFinance entities, properties, and COA codes without normalization guesswork.

## Migration Note

Historical data (2022-2026) will continue to be imported with the normalization map that handles the old PO Number mess. New purchases after restructure will use the clean fields directly — the importer checks GL Code, Cost Center, and Department first and falls back to PO Number normalization only if those are empty.
