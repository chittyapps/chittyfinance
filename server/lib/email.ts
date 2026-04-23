/**
 * Email service using Cloudflare Email Service (beta).
 * Replaces SendGrid for transactional email.
 *
 * Sender addresses: finance@chitty.cc, noreply@chitty.cc
 * Domain: chitty.cc (onboarded via Cloudflare dashboard)
 */

import type { Env } from '../env';

interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
}

const DEFAULT_FROM = { email: 'finance@chitty.cc', name: 'ChittyFinance' };

/**
 * Send a transactional email via Cloudflare Email Service.
 * Falls back silently if EMAIL binding is not configured.
 */
export async function sendEmail(env: Env, options: EmailOptions): Promise<{ sent: boolean; messageId?: string; error?: string }> {
  if (!env.EMAIL) {
    console.warn('[email] EMAIL binding not configured — skipping send');
    return { sent: false, error: 'email_not_configured' };
  }

  try {
    const result = await env.EMAIL.send({
      to: options.to,
      from: options.from ? { email: options.from, name: 'ChittyFinance' } : DEFAULT_FROM,
      subject: options.subject,
      html: options.html,
      text: options.text,
      cc: options.cc,
      bcc: options.bcc,
      replyTo: options.replyTo ?? 'nick@aribia.llc',
    });

    return { sent: true, messageId: result.messageId };
  } catch (e: any) {
    console.error('[email] Send failed:', e.code, e.message);
    return { sent: false, error: e.message };
  }
}

// ── Email templates ──

export function leaseExpirationEmail(tenantName: string, propertyName: string, unitName: string, expiresAt: string, daysLeft: number): EmailOptions {
  return {
    to: 'nick@aribia.llc',
    subject: `Lease expiring in ${daysLeft} days — ${propertyName} ${unitName}`,
    html: `
      <h2>Lease Expiration Notice</h2>
      <p><strong>Property:</strong> ${propertyName}</p>
      <p><strong>Unit:</strong> ${unitName}</p>
      <p><strong>Tenant:</strong> ${tenantName}</p>
      <p><strong>Expires:</strong> ${expiresAt} (${daysLeft} days)</p>
      <p>Review at <a href="https://finance.chitty.cc/properties">ChittyFinance</a>.</p>
    `,
    text: `Lease expiring: ${propertyName} ${unitName} — ${tenantName} — ${expiresAt} (${daysLeft} days)`,
  };
}

export function classificationAlertEmail(count: number, tenantName: string): EmailOptions {
  return {
    to: 'nick@aribia.llc',
    subject: `${count} transactions need classification — ${tenantName}`,
    html: `
      <h2>Classification Queue</h2>
      <p><strong>${count}</strong> transactions in <strong>${tenantName}</strong> are pending classification (COA code 9010 — Suspense).</p>
      <p>Review at <a href="https://finance.chitty.cc/classification">ChittyFinance Classification</a>.</p>
    `,
    text: `${count} transactions need classification in ${tenantName}. Review at finance.chitty.cc/classification`,
  };
}

export function webhookIngestionEmail(source: string, count: number, tenantName: string): EmailOptions {
  return {
    to: 'nick@aribia.llc',
    subject: `${count} ${source} transactions ingested — ${tenantName}`,
    html: `
      <h2>${source} Webhook Ingestion</h2>
      <p><strong>${count}</strong> new transactions ingested for <strong>${tenantName}</strong>.</p>
      <p>Review at <a href="https://finance.chitty.cc/transactions">ChittyFinance</a>.</p>
    `,
    text: `${count} ${source} transactions ingested for ${tenantName}`,
  };
}

export function dailySummaryEmail(stats: {
  totalTransactions: number;
  suspenseCount: number;
  expiringLeases: number;
  entities: string[];
}): EmailOptions {
  return {
    to: 'nick@aribia.llc',
    subject: `Daily Finance Summary — ${new Date().toISOString().slice(0, 10)}`,
    html: `
      <h2>Daily Finance Summary</h2>
      <table style="border-collapse:collapse;width:100%">
        <tr><td style="padding:4px 8px;border-bottom:1px solid #eee"><strong>Total transactions</strong></td><td style="padding:4px 8px;border-bottom:1px solid #eee">${stats.totalTransactions}</td></tr>
        <tr><td style="padding:4px 8px;border-bottom:1px solid #eee"><strong>Pending classification</strong></td><td style="padding:4px 8px;border-bottom:1px solid #eee">${stats.suspenseCount}</td></tr>
        <tr><td style="padding:4px 8px;border-bottom:1px solid #eee"><strong>Expiring leases</strong></td><td style="padding:4px 8px;border-bottom:1px solid #eee">${stats.expiringLeases}</td></tr>
        <tr><td style="padding:4px 8px"><strong>Active entities</strong></td><td style="padding:4px 8px">${stats.entities.join(', ')}</td></tr>
      </table>
      <p><a href="https://finance.chitty.cc">Open ChittyFinance</a></p>
    `,
    text: `Daily summary: ${stats.totalTransactions} txns, ${stats.suspenseCount} pending classification, ${stats.expiringLeases} expiring leases`,
  };
}
