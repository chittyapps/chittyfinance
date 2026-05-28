# Books

Books **writes facts**: ingest, categorize, and journal financial activity.

Boundary: Books records what happened (transactions, imports, webhook intake). It does not derive meaning — chart of accounts, reporting, tax, and allocations live in `server/accounting/`.

Owner: `chittybooks-agent` → ingest / categorize / journal.
