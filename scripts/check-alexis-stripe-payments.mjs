#!/usr/bin/env node
/**
 * Check Alexis's payment history via Stripe
 * Customer ID: cus_TNKaJIL1Bg1A3y
 */

import Stripe from 'stripe';

const ALEXIS_CUSTOMER_ID = 'cus_TNKaJIL1Bg1A3y';

async function checkAlexisPayments() {
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeKey) {
    console.error('❌ STRIPE_SECRET_KEY not set');
    process.exit(1);
  }

  const stripe = new Stripe(stripeKey);

  console.log('💳 CHECKING ALEXIS PHENG PAYMENT HISTORY');
  console.log('='.repeat(80));
  console.log(`Customer ID: ${ALEXIS_CUSTOMER_ID}`);
  console.log(`Email: acpheng@gmail.com\n`);

  try {
    // Get customer details
    console.log('📋 Fetching customer details...');
    const customer = await stripe.customers.retrieve(ALEXIS_CUSTOMER_ID);
    console.log(`   Name: ${customer.name || 'N/A'}`);
    console.log(`   Email: ${customer.email || 'N/A'}`);
    console.log(`   Balance: $${(customer.balance / 100).toFixed(2)}`);
    console.log('');

    // Get payment intents (recent payments)
    console.log('💰 Fetching payment history...');
    const paymentIntents = await stripe.paymentIntents.list({
      customer: ALEXIS_CUSTOMER_ID,
      limit: 50,
    });

    console.log(`   Found ${paymentIntents.data.length} payment intents\n`);

    if (paymentIntents.data.length === 0) {
      console.log('   ⚠️  No payment intents found');
    } else {
      console.log('PAYMENT HISTORY:');
      console.log('-'.repeat(80));

      paymentIntents.data.forEach((pi, idx) => {
        const date = new Date(pi.created * 1000);
        const amount = (pi.amount / 100).toFixed(2);
        const status = pi.status;
        const description = pi.description || 'N/A';

        console.log(`\n${idx + 1}. Payment ${pi.id}`);
        console.log(`   Date: ${date.toLocaleDateString()} ${date.toLocaleTimeString()}`);
        console.log(`   Amount: $${amount}`);
        console.log(`   Status: ${status}`);
        console.log(`   Description: ${description}`);

        if (pi.latest_charge) {
          console.log(`   Charge ID: ${pi.latest_charge}`);
        }
      });
    }

    // Get charges (alternative view)
    console.log('\n\n💵 Fetching charge history...');
    const charges = await stripe.charges.list({
      customer: ALEXIS_CUSTOMER_ID,
      limit: 50,
    });

    console.log(`   Found ${charges.data.length} charges\n`);

    if (charges.data.length > 0) {
      console.log('CHARGE HISTORY:');
      console.log('-'.repeat(80));

      charges.data.forEach((charge, idx) => {
        const date = new Date(charge.created * 1000);
        const amount = (charge.amount / 100).toFixed(2);
        const status = charge.status;
        const description = charge.description || 'N/A';

        console.log(`\n${idx + 1}. Charge ${charge.id}`);
        console.log(`   Date: ${date.toLocaleDateString()} ${date.toLocaleTimeString()}`);
        console.log(`   Amount: $${amount}`);
        console.log(`   Status: ${status}`);
        console.log(`   Description: ${description}`);
        console.log(`   Paid: ${charge.paid ? 'YES ✅' : 'NO ❌'}`);
        console.log(`   Refunded: ${charge.refunded ? 'YES' : 'NO'}`);

        if (charge.receipt_url) {
          console.log(`   Receipt: ${charge.receipt_url}`);
        }
      });
    }

    // Check for December 2025 payments specifically
    console.log('\n\n🔍 DECEMBER 2025 PAYMENT STATUS:');
    console.log('-'.repeat(80));

    const dec2025Start = new Date('2025-12-01T00:00:00Z').getTime() / 1000;
    const dec2025End = new Date('2025-12-31T23:59:59Z').getTime() / 1000;

    const dec2025Payments = paymentIntents.data.filter(
      pi => pi.created >= dec2025Start && pi.created <= dec2025End
    );

    const dec2025Charges = charges.data.filter(
      charge => charge.created >= dec2025Start && charge.created <= dec2025End
    );

    if (dec2025Payments.length === 0 && dec2025Charges.length === 0) {
      console.log('❌ NO PAYMENTS FOUND IN DECEMBER 2025');
    } else {
      console.log(`✅ Found ${dec2025Payments.length} payment intents and ${dec2025Charges.length} charges in December 2025\n`);

      dec2025Charges.forEach(charge => {
        const date = new Date(charge.created * 1000);
        const amount = (charge.amount / 100).toFixed(2);
        console.log(`   • ${date.toLocaleDateString()}: $${amount} - ${charge.status} ${charge.paid ? '✅' : '❌'}`);
      });
    }

    // Get subscriptions
    console.log('\n\n📆 SUBSCRIPTION STATUS:');
    console.log('-'.repeat(80));

    const subscriptions = await stripe.subscriptions.list({
      customer: ALEXIS_CUSTOMER_ID,
      limit: 10,
    });

    console.log(`   Found ${subscriptions.data.length} subscriptions\n`);

    if (subscriptions.data.length > 0) {
      subscriptions.data.forEach((sub, idx) => {
        const status = sub.status;
        const amount = sub.items.data[0]?.price?.unit_amount
          ? (sub.items.data[0].price.unit_amount / 100).toFixed(2)
          : 'N/A';
        const interval = sub.items.data[0]?.price?.recurring?.interval || 'N/A';

        console.log(`${idx + 1}. Subscription ${sub.id}`);
        console.log(`   Status: ${status}`);
        console.log(`   Amount: $${amount} / ${interval}`);
        console.log(`   Current period: ${new Date(sub.current_period_start * 1000).toLocaleDateString()} - ${new Date(sub.current_period_end * 1000).toLocaleDateString()}`);
        console.log('');
      });
    }

    // Get invoices
    console.log('\n📄 INVOICE HISTORY:');
    console.log('-'.repeat(80));

    const invoices = await stripe.invoices.list({
      customer: ALEXIS_CUSTOMER_ID,
      limit: 50,
    });

    console.log(`   Found ${invoices.data.length} invoices\n`);

    if (invoices.data.length > 0) {
      invoices.data.forEach((invoice, idx) => {
        const date = new Date(invoice.created * 1000);
        const amount = (invoice.amount_due / 100).toFixed(2);
        const paid = invoice.paid;
        const status = invoice.status;

        console.log(`${idx + 1}. Invoice ${invoice.number || invoice.id}`);
        console.log(`   Date: ${date.toLocaleDateString()}`);
        console.log(`   Amount: $${amount}`);
        console.log(`   Status: ${status} ${paid ? '✅ PAID' : '❌ UNPAID'}`);

        if (invoice.due_date) {
          console.log(`   Due: ${new Date(invoice.due_date * 1000).toLocaleDateString()}`);
        }
        console.log('');
      });
    }

  } catch (error) {
    console.error('❌ Error fetching Stripe data:', error.message);
    if (error.type === 'StripeInvalidRequestError') {
      console.error('   Customer ID may be invalid or from a different Stripe account');
    }
  }
}

checkAlexisPayments().catch(console.error);
