/**
 * Lease expiration notification service.
 *
 * Runs via Cloudflare Cron Triggers (scheduled handler in worker.ts).
 * Checks for leases expiring in non-overlapping windows (0-30, 31-60, 61-90 days) and:
 *   1. Creates a task linked to the lease (deduped by relatedTo/relatedId + title)
 *   2. Optionally sends email (SendGrid) and SMS (Twilio) to the tenant
 */

import type { Env } from '../env';
import { createDb } from '../db/connection';
import { SystemStorage } from '../storage/system';
import { SendGridClient, EMAIL_TEMPLATES } from './sendgrid';
import { TwilioClient, TEMPLATES as SMS_TEMPLATES } from './twilio';

// Non-overlapping windows: each lease matches exactly one window
const NOTIFICATION_WINDOWS = [
  { minDays: 0, maxDays: 30, taskTitle: 'Lease expiring in 30 days', smsTemplate: 'lease_reminder_30' as const, priority: 'urgent' as const },
  { minDays: 31, maxDays: 60, taskTitle: 'Lease expiring in 60 days', smsTemplate: 'lease_reminder_60' as const, priority: 'high' as const },
  { minDays: 61, maxDays: 90, taskTitle: 'Lease expiring in 90 days', smsTemplate: 'lease_reminder_90' as const, priority: 'medium' as const },
];

export interface LeaseExpirationStats {
  checked: number;
  tasksCreated: number;
  emailsSent: number;
  smsSent: number;
  emailsFailed: number;
  smsFailed: number;
  errors: string[];
}

function formatDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toISOString().split('T')[0];
}

export async function processLeaseExpirations(env: Env): Promise<LeaseExpirationStats> {
  if (!env.DATABASE_URL) {
    throw new Error('[lease-expiration] DATABASE_URL binding is not configured');
  }

  const db = createDb(env.DATABASE_URL);
  const storage = new SystemStorage(db);

  const stats: LeaseExpirationStats = {
    checked: 0, tasksCreated: 0, emailsSent: 0, smsSent: 0,
    emailsFailed: 0, smsFailed: 0, errors: [],
  };

  const sendgrid = env.SENDGRID_API_KEY && env.SENDGRID_FROM_EMAIL
    ? new SendGridClient({ apiKey: env.SENDGRID_API_KEY, fromEmail: env.SENDGRID_FROM_EMAIL })
    : null;
  const twilio = env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_PHONE_NUMBER
    ? new TwilioClient({ accountSid: env.TWILIO_ACCOUNT_SID, authToken: env.TWILIO_AUTH_TOKEN, fromNumber: env.TWILIO_PHONE_NUMBER })
    : null;

  if (!sendgrid) console.warn('[lease-expiration] SendGrid not configured — email notifications disabled');
  if (!twilio) console.warn('[lease-expiration] Twilio not configured — SMS notifications disabled');

  for (const window of NOTIFICATION_WINDOWS) {
    const expiring = await storage.getExpiringLeases(window.maxDays, undefined, window.minDays);
    stats.checked += expiring.length;

    for (const { lease, unit, property } of expiring) {
      try {
        const existingTasks = await storage.getTasksByRelation('lease', lease.id);
        if (existingTasks.some((t) => t.title === window.taskTitle)) continue;

        const endDateStr = formatDate(lease.endDate);

        await storage.createTask({
          tenantId: property.tenantId,
          title: window.taskTitle,
          description: `${lease.tenantName}'s lease at ${property.name} (Unit ${unit.unitNumber || 'N/A'}) expires ${endDateStr}.`,
          dueDate: lease.endDate,
          priority: window.priority,
          status: 'pending',
          relatedTo: 'lease',
          relatedId: lease.id,
          metadata: {
            notificationWindow: window.maxDays,
            leaseEndDate: endDateStr,
            propertyId: property.id,
            unitId: unit.id,
          },
        });
        stats.tasksCreated++;

        if (sendgrid && lease.tenantEmail) {
          try {
            const email = EMAIL_TEMPLATES.lease_reminder(lease.tenantName, property.name, endDateStr);
            await sendgrid.sendEmail({ to: lease.tenantEmail, ...email });
            stats.emailsSent++;
          } catch (err) {
            stats.emailsFailed++;
            const msg = `Email to ${lease.tenantEmail} for lease ${lease.id}: ${err instanceof Error ? err.message : String(err)}`;
            stats.errors.push(msg);
            console.error(`[lease-expiration] ${msg}`);
          }
        }

        if (twilio && lease.tenantPhone) {
          try {
            const smsBody = SMS_TEMPLATES[window.smsTemplate](lease.tenantName, endDateStr);
            await twilio.sendSms(lease.tenantPhone, smsBody);
            stats.smsSent++;
          } catch (err) {
            stats.smsFailed++;
            const msg = `SMS to ${lease.tenantPhone} for lease ${lease.id}: ${err instanceof Error ? err.message : String(err)}`;
            stats.errors.push(msg);
            console.error(`[lease-expiration] ${msg}`);
          }
        }
      } catch (err) {
        const msg = `Lease ${lease.id} (tenant ${property.tenantId}): ${err instanceof Error ? err.message : String(err)}`;
        stats.errors.push(msg);
        console.error(`[lease-expiration] ${msg}`);
      }
    }
  }

  return stats;
}
