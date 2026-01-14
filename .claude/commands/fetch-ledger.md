# Fetch TurboTenant General Ledger

Use browser automation to export the general ledger from TurboTenant's REI Accounting module.

## Workflow

1. **Navigate to TurboTenant**
   - Go to https://rental.turbotenant.com/
   - Wait for user to complete login if not already authenticated

2. **Navigate to Finance/Accounting**
   - Look for "Accounting" or "Finance" in the navigation menu
   - Click to open the accounting dashboard

3. **Export General Ledger**
   - Find the "Reports" or "General Ledger" section
   - Look for export/download button (usually CSV or Excel icon)
   - Set date range to "All Time" or maximum available range
   - Download the CSV file

4. **Save and Process**
   - Save the file to: /home/user/chittyfinance/data/turbotenant-ledger.csv
   - After download, run the analysis:
     ```
     npx ts-node scripts/import-turbotenant.ts data/turbotenant-ledger.csv --analyze --output data/corrected-ledger.csv
     ```

5. **Report Results**
   - Show summary of transactions found
   - Highlight any categorization issues
   - List items needing manual review

## Notes
- Wait for user authentication - do not attempt to enter credentials
- If export options include format selection, prefer CSV over Excel
- If multiple properties are available, export all or ask user which to include
