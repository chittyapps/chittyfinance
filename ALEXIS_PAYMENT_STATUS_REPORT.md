# Alexis Pheng - December 2025 Rent Payment Status Report

**Report Date:** December 9, 2025
**Property:** City Studio at The Commodore
**Address:** 550 W Surf St C211, Chicago, IL
**Lease ID:** 690e47b7d84b610e20287ca2

---

## 🎯 EXECUTIVE SUMMARY

**STATUS: RENT PAYMENT OVERDUE**

Alexis Pheng has **NOT paid** the December 2025 rent charge of $1,282.26 (prorated for December 1-15, 2025). The payment is currently overdue, with automated notices being sent daily since December 3, 2025.

---

## 📋 TENANT INFORMATION

- **Name:** Alexis Pheng
- **Email:** acpheng@gmail.com
- **Phone:** 804-665-8632
- **Tenant ID:** 690e49e5d84b610e202cdb02
- **DoorLoop Stripe Customer ID:** cus_TNKaJIL1Bg1A3y (different Stripe account)

---

## 🏠 LEASE DETAILS

- **Lease ID:** 690e47b7d84b610e20287ca2
- **Property:** City Studio at The Commodore (66d7aad23cf0357c2a3c9430)
- **Unit ID:** 66d7aad33cf0357c2a3c9440
- **Address:** 550 W Surf St C211, Chicago, IL 60657
- **Lease Term:** November 8, 2025 → December 15, 2026
- **Status:** ACTIVE
- **Monthly Rent:** $2,650.00
- **Lease Type:** Fixed-term, 13-month lease

---

## 💰 DECEMBER 2025 RENT CHARGE

**Charge Posted:** December 1, 2025

| Field | Value |
|-------|-------|
| **Charge ID** | 690e47b8d84b610e20288103 |
| **Date** | 2025-12-01 |
| **Amount** | $1,282.26 |
| **Description** | Prorated Rent December 1-15 |
| **Account** | 69023fde977b09efc7ca865e |
| **Total Balance** | $1,282.26 |
| **Status** | **UNPAID** ❌ |

**Note:** This is a prorated charge covering December 1-15, 2025. The lease started November 8, 2025, so this represents half of the monthly rent for December.

---

## 💸 CURRENT FINANCIAL STATUS

From DoorLoop lease details (retrieved December 9, 2025):

```json
{
  "totalBalanceDue": 1282.26,
  "outstandingBalance": 1282.26,
  "currentBalance": 0,
  "overdueBalance": 1282.26,
  "upcomingBalance": 0
}
```

**Balance Due:** $1,282.26 (OVERDUE)

---

## 📧 AUTOMATED COLLECTION NOTICES

DoorLoop has sent automated overdue notices on the following dates:

- **December 3, 2025** - "Attention: Your Rent Payment Is Overdue" (2 emails)
- **December 4, 2025** - "Attention: Your Rent Payment Is Overdue" (2 emails)
- **December 5, 2025** - "Attention: Your Rent Payment Is Overdue" (2 emails)
- **December 6, 2025** - "Attention: Your Rent Payment Is Overdue" (2 emails)
- **December 7, 2025** - "Attention: Your Rent Payment Is Overdue" (2 emails)
- **December 8, 2025** - "Attention: Your Rent Payment Is Overdue" (2 emails)
- **December 9, 2025** - "Attention: Your Rent Payment Is Overdue" (2 emails)

**Total:** 14 overdue notices sent over 7 days

Additional notices sent:
- **December 1, 2025** - "Reminder: Final Day to Pay Rent" (2 emails)

---

## 📊 PAYMENT HISTORY

### November 2025 Payments (PAID ✅)

**Payment Date:** November 6, 2025

| Charge | Amount | Status |
|--------|--------|--------|
| Pro-rated Rent (Nov 8-30) | $2,031.67 | PAID ✅ |
| Cleaning Fee | $250.00 | PAID ✅ |
| Administration Fee | $250.00 | PAID ✅ |
| Move-In Fee | $250.00 | PAID ✅ |
| **TOTAL** | **$2,781.67** | **PAID ✅** |

**Credits Applied:**
- Management Fee Waived: $250.00 (Nov 6, 2025)

**Payment Method:** EPAY (Electronic Payment)
**Payment Reference:** 2g3gah

**Last Payment Confirmation Email:** November 7, 2025 - "Thank you for your payment! View your receipt"

### December 2025 Payments

**❌ NO PAYMENTS RECEIVED**

DoorLoop lease-payments endpoint confirms **zero payments** posted in December 2025.

---

## 🔍 VERIFICATION METHODS

This status has been verified through multiple DoorLoop API endpoints:

1. **`/lease-charges`** - Shows charge posted with full balance remaining
2. **`/lease-payments`** - Shows no payments in December 2025
3. **`/leases/{id}`** - Shows `overdueBalance: 1282.26`
4. **`/communications`** - Shows daily overdue notices since Dec 3
5. **`/lease-credits`** - Shows no credits applied to December charge
6. **`/lease-reversed-payments`** - Shows no reversed/refunded payments

All six independent data sources confirm the same status: **UNPAID**.

---

## ⚠️ ADDITIONAL NOTES

### Renters Insurance Non-Compliance

DoorLoop lease details show:
```json
{
  "proofOfInsuranceRequired": true,
  "proofOfInsuranceStatus": "NO_INSURANCE"
}
```

**Status:** Alexis is required to maintain renters insurance but has not provided proof of coverage.

### Previous Insurance Violations

Historical charges show fines for missing renters insurance for a different property:
- August 17, 2025: $100 fine - "No valid renters insurance – Aug 10-16, 2025"
- August 3, 2025: $100 fine - "No valid renters insurance – July 27-Aug 2, 2025"

(Note: These appear to be for a different tenant with a different lease at a different property)

---

## 📁 ARCHIVED DATA

Complete DoorLoop data has been archived before API access expires:

### Archives Created (December 9, 2025):

1. **doorloop-archive-2025-12-09.json**
   - 6 properties
   - 16 leases (6 active, 10 inactive)
   - 50 tenants
   - 8 units
   - 5 expenses

2. **doorloop-communications-2025-12-09.json**
   - 50 communications
   - 6 communications related to Alexis

3. **doorloop-final-archive-2025-12-09.json**
   - Rent roll (8 records)
   - Notes (4 records)
   - Files (50 records)
   - Complete Alexis lease and payment data
   - Financial reports (unavailable - premium API access required)

### Archive Summary

**Total Records Archived:** 351+ records across 12+ accessible DoorLoop endpoints

**Inaccessible Endpoints:** 53 endpoints returned errors (404, 405, or require premium access)

---

## 🎯 RECOMMENDED ACTIONS

1. **Immediate:** Contact Alexis Pheng directly via phone (804-665-8632) or email (acpheng@gmail.com)

2. **Follow-up:** Request payment of $1,282.26 for December 1-15, 2025 prorated rent

3. **Insurance Compliance:** Request proof of renters insurance (currently non-compliant)

4. **Payment Plan:** If tenant is experiencing financial hardship, consider payment plan options

5. **Late Fees:** Review Chicago RLTO late fee guidelines before assessing additional charges
   - Standard: $10 for first $500 + 5% of remainder
   - For $1,282.26: Late fee would be $10 + $39.11 = $49.11

6. **Documentation:** All collection communications should reference:
   - Charge ID: 690e47b8d84b610e20288103
   - Amount: $1,282.26
   - Period: December 1-15, 2025
   - Due Date: December 1, 2025

---

## 📞 CONTACT INFORMATION

**Property Manager:** Chicago Furnished Condos by ARIBIA
**Property Address:** 550 W Surf St C211, Chicago, IL 60657
**Tenant:** Alexis Pheng
**Tenant Email:** acpheng@gmail.com
**Tenant Phone:** 804-665-8632

---

## ✅ REPORT VERIFICATION

This report is based on live DoorLoop API data retrieved on December 9, 2025 at 8:08 PM CST.

**Verified By:**
- DoorLoop API endpoints (6 independent sources)
- Communication logs (automated notices)
- Lease charge records
- Payment history records
- Lease status records

**Report Status:** VERIFIED ✅

**Last Updated:** December 9, 2025

---

*End of Report*
