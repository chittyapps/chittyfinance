# Fetch TurboTenant General Ledger

Use browser automation to view TurboTenant ledger and sync to Google Sheets.

## Target Google Sheet
https://docs.google.com/spreadsheets/d/1mOMFTrsaxzoqCDVhWlGpseNla-s7--3Ehsg7wL_jvII

## Workflow

1. **Open TurboTenant**
   - Go to https://rental.turbotenant.com/
   - Wait for user to complete login if not already authenticated

2. **Navigate to Accounting**
   - Look for "Accounting" or "Finance" in the navigation
   - Click to open the accounting/REI Hub dashboard

3. **View General Ledger**
   - Find "Reports" or "General Ledger" section
   - Set date range to "All Time" or maximum range
   - View all transactions

4. **Copy Data to Google Sheets**
   - Select all ledger data (Ctrl+A or select table)
   - Copy the data (Ctrl+C)
   - Open the target Google Sheet in a new tab
   - Paste data into the sheet (Ctrl+V)
   - Or: Export CSV from TurboTenant, then File > Import in Google Sheets

5. **Run Analysis**
   - After data is in Google Sheets, fetch and analyze:
     ```
     npx ts-node scripts/fetch-turbotenant-ledger.ts --analyze
     ```

## Notes
- Wait for user authentication - do not enter credentials
- If TurboTenant has direct "Export to Google Sheets" option, use that
- Preserve all columns: Date, Description, Account, Debit, Credit, Property
