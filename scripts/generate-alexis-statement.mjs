#!/usr/bin/env node
/**
 * Generate complete tenant statement for Alexis Pheng
 * Shows all charges, payments, and current balance
 */

import fs from 'fs';

const ALEXIS_LEASE_ID = '690e47b7d84b610e20287ca2';
const ALEXIS_TENANT_ID = '690e49e5d84b610e202cdb02';

// Load complete archive
const archive = JSON.parse(fs.readFileSync('doorloop-complete-archive-2025-12-09.json', 'utf8'));

console.log('TENANT STATEMENT');
console.log('='.repeat(100));
console.log('');
console.log('TENANT: Alexis Pheng');
console.log('EMAIL: acpheng@gmail.com');
console.log('PHONE: 804-665-8632');
console.log('PROPERTY: City Studio at The Commodore');
console.log('ADDRESS: 550 W Surf St C211, Chicago, IL 60657');
console.log('LEASE ID: 690e47b7d84b610e20287ca2');
console.log('STATEMENT DATE: December 9, 2025');
console.log('');
console.log('='.repeat(100));
console.log('');

// Extract Alexis's charges
const allCharges = archive.data.lease_charges || [];
const alexisCharges = allCharges.filter(charge => charge.lease === ALEXIS_LEASE_ID);

console.log('CHARGES:');
console.log('');
console.log(
  'Date'.padEnd(15) +
  'Description'.padEnd(35) +
  'Amount'.padStart(12) +
  'Balance'.padStart(12) +
  'Status'.padStart(10)
);
console.log('-'.repeat(100));

let totalCharges = 0;
const chargeDetails = [];

alexisCharges.forEach(charge => {
  const date = new Date(charge.date).toLocaleDateString();
  const amount = parseFloat(charge.totalAmount || 0);
  const balance = parseFloat(charge.totalBalance || 0);
  const status = balance === 0 ? 'PAID ✅' : 'DUE ❌';

  totalCharges += amount;

  charge.lines?.forEach(line => {
    const desc = (line.memo || 'Charge').substring(0, 34);
    const lineAmount = parseFloat(line.amount || 0);
    const lineBalance = parseFloat(line.balance || 0);

    console.log(
      date.padEnd(15) +
      desc.padEnd(35) +
      `$${lineAmount.toFixed(2)}`.padStart(12) +
      `$${lineBalance.toFixed(2)}`.padStart(12) +
      status.padStart(10)
    );

    chargeDetails.push({
      date: charge.date,
      description: desc,
      amount: lineAmount,
      balance: lineBalance,
      status: balance === 0 ? 'PAID' : 'UNPAID',
      reference: charge.reference,
    });
  });
});

console.log('-'.repeat(100));
console.log(
  'TOTAL CHARGES:'.padEnd(50) +
  `$${totalCharges.toFixed(2)}`.padStart(12)
);
console.log('');
console.log('');

// Extract Alexis's payments
const allPayments = archive.data.lease_payments || [];
const alexisPayments = allPayments.filter(payment => payment.lease === ALEXIS_LEASE_ID);

console.log('PAYMENTS:');
console.log('');
console.log(
  'Date'.padEnd(15) +
  'Method'.padEnd(20) +
  'Reference'.padEnd(20) +
  'Amount'.padStart(15) +
  'Status'.padStart(10)
);
console.log('-'.repeat(100));

let totalPayments = 0;

alexisPayments.forEach(payment => {
  const date = new Date(payment.date || payment.createdAt).toLocaleDateString();
  const method = payment.paymentMethod || 'N/A';
  const reference = payment.reference || payment.id?.substring(0, 10) || 'N/A';
  const amount = parseFloat(payment.totalAmount || payment.amount || 0);
  const status = payment.status || 'Completed';

  totalPayments += amount;

  console.log(
    date.padEnd(15) +
    method.padEnd(20) +
    reference.padEnd(20) +
    `$${amount.toFixed(2)}`.padStart(15) +
    status.padStart(10)
  );

  // Show payment details if available
  payment.lines?.forEach(line => {
    const lineDesc = (line.memo || '').substring(0, 30);
    const lineAmount = parseFloat(line.amount || 0);

    if (lineDesc) {
      console.log(
        ''.padEnd(15) +
        `  • ${lineDesc}`.padEnd(20) +
        ''.padEnd(20) +
        `$${lineAmount.toFixed(2)}`.padStart(15)
      );
    }
  });
});

console.log('-'.repeat(100));
console.log(
  'TOTAL PAYMENTS:'.padEnd(50) +
  `$${totalPayments.toFixed(2)}`.padStart(15)
);
console.log('');
console.log('');

// Extract Alexis's credits
const allCredits = archive.data.lease_credits || [];
const alexisCredits = allCredits.filter(credit => credit.lease === ALEXIS_LEASE_ID);

if (alexisCredits.length > 0) {
  console.log('CREDITS:');
  console.log('');
  console.log(
    'Date'.padEnd(15) +
    'Description'.padEnd(50) +
    'Amount'.padStart(15)
  );
  console.log('-'.repeat(100));

  let totalCredits = 0;

  alexisCredits.forEach(credit => {
    const date = new Date(credit.date || credit.createdAt).toLocaleDateString();
    const amount = parseFloat(credit.totalAmount || credit.amount || 0);

    totalCredits += amount;

    credit.lines?.forEach(line => {
      const desc = (line.memo || 'Credit').substring(0, 49);
      const lineAmount = parseFloat(line.amount || 0);

      console.log(
        date.padEnd(15) +
        desc.padEnd(50) +
        `$${lineAmount.toFixed(2)}`.padStart(15)
      );
    });
  });

  console.log('-'.repeat(100));
  console.log(
    'TOTAL CREDITS:'.padEnd(65) +
    `$${totalCredits.toFixed(2)}`.padStart(15)
  );
  console.log('');
  console.log('');
}

// Calculate balance
console.log('');
console.log('='.repeat(100));
console.log('ACCOUNT SUMMARY:');
console.log('='.repeat(100));
console.log('');
console.log(`Total Charges:          $${totalCharges.toFixed(2)}`.padStart(60));
console.log(`Total Payments:        -$${totalPayments.toFixed(2)}`.padStart(60));
if (alexisCredits.length > 0) {
  const totalCredits = alexisCredits.reduce((sum, c) => sum + parseFloat(c.totalAmount || 0), 0);
  console.log(`Total Credits:         -$${totalCredits.toFixed(2)}`.padStart(60));
}
console.log('-'.repeat(60).padStart(60));

const calculatedBalance = totalCharges - totalPayments -
  (alexisCredits.reduce((sum, c) => sum + parseFloat(c.totalAmount || 0), 0));

console.log('');
console.log(`BALANCE DUE:            $${calculatedBalance.toFixed(2)}`.padStart(60));
console.log('');

if (calculatedBalance > 0) {
  console.log('⚠️  BALANCE OVERDUE'.padStart(60));
  console.log('');
  console.log('Breakdown of outstanding charges:');
  console.log('');

  chargeDetails
    .filter(c => c.balance > 0)
    .forEach(c => {
      const date = new Date(c.date).toLocaleDateString();
      console.log(
        `  ${date} - ${c.description}: $${c.balance.toFixed(2)} ${c.status === 'UNPAID' ? '❌' : ''}`
      );
    });
} else {
  console.log('✅ ACCOUNT PAID IN FULL'.padStart(60));
}

console.log('');
console.log('='.repeat(100));
console.log('');

// Detailed transaction history
console.log('');
console.log('DETAILED TRANSACTION HISTORY:');
console.log('='.repeat(100));
console.log('');

// Combine all transactions with dates
const allTransactions = [];

alexisCharges.forEach(charge => {
  charge.lines?.forEach(line => {
    allTransactions.push({
      date: new Date(charge.date),
      type: 'CHARGE',
      description: line.memo || 'Charge',
      amount: parseFloat(line.amount || 0),
      balance: parseFloat(line.balance || 0),
      reference: charge.reference,
    });
  });
});

alexisPayments.forEach(payment => {
  allTransactions.push({
    date: new Date(payment.date || payment.createdAt),
    type: 'PAYMENT',
    description: payment.paymentMethod || 'Payment',
    amount: parseFloat(payment.totalAmount || payment.amount || 0),
    balance: null,
    reference: payment.reference,
  });
});

alexisCredits.forEach(credit => {
  credit.lines?.forEach(line => {
    allTransactions.push({
      date: new Date(credit.date || credit.createdAt),
      type: 'CREDIT',
      description: line.memo || 'Credit',
      amount: parseFloat(line.amount || 0),
      balance: null,
      reference: credit.reference,
    });
  });
});

// Sort by date
allTransactions.sort((a, b) => a.date - b.date);

console.log(
  'Date'.padEnd(15) +
  'Type'.padEnd(10) +
  'Description'.padEnd(40) +
  'Amount'.padStart(12) +
  'Balance'.padStart(12)
);
console.log('-'.repeat(100));

let runningBalance = 0;

allTransactions.forEach(tx => {
  const date = tx.date.toLocaleDateString();
  const type = tx.type;
  const desc = tx.description.substring(0, 39);
  const amount = tx.amount;

  if (type === 'CHARGE') {
    runningBalance += amount;
  } else {
    runningBalance -= amount;
  }

  const balanceStr = tx.balance !== null && tx.balance !== undefined
    ? `$${tx.balance.toFixed(2)}`
    : `$${runningBalance.toFixed(2)}`;

  console.log(
    date.padEnd(15) +
    type.padEnd(10) +
    desc.padEnd(40) +
    `$${amount.toFixed(2)}`.padStart(12) +
    balanceStr.padStart(12)
  );
});

console.log('-'.repeat(100));
console.log(
  'CURRENT BALANCE:'.padEnd(65) +
  `$${calculatedBalance.toFixed(2)}`.padStart(12)
);
console.log('');
console.log('='.repeat(100));
console.log('');
console.log('END OF STATEMENT');
console.log('');
console.log(`Generated: ${new Date().toISOString()}`);
console.log(`Data Source: DoorLoop API (doorloop-complete-archive-2025-12-09.json)`);
console.log('');
