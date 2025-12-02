---
description: Reset and reseed database
---

Reset database to clean IT CAN BE LLC structure:

**WARNING**: This destroys all data. Production use requires confirmation.

Steps:
1. Drop all tables: `MODE=system npm run db:push:system -- --force`
2. Recreate schema: `MODE=system npm run db:push:system`
3. Seed entities: `npm run db:seed`
4. Verify: Query tenants, users, tenant_users counts

Show counts:
- Tenants: 7 (IT CAN BE LLC structure)
- Users: 2 (Nicholas, Sharon)
- Properties: 2 (City Studio, Apt Arlene)
- Accounts: 0 (manual setup required)
