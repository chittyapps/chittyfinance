---
description: Switch tenant context for testing
---

Switch to specified tenant and validate access:

Usage: `/tenant-switch [tenant-slug]`

Available tenants:
- it-can-be-llc (parent holding)
- jean-arlene-venturing (personal)
- aribia-llc (series parent)
- aribia-mgmt (management)
- aribia-city-studio (property)
- aribia-apt-arlene (property)
- chittycorp (pending)

Actions:
1. Query tenants table for specified slug
2. Verify user has access via tenant_users
3. Set tenant context in session
4. List accessible accounts for tenant
5. Display financial summary

Output format:
```
Tenant: [name]
Type: [type]
Accounts: [count]
Balance: $[total]
```
