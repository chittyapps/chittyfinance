/**
 * Lease expiration notification service.
 *
 * Runs via Cloudflare Cron Triggers (scheduled handler in worker.ts).
 * Checks for leases expiring within 30/60/90 days and:
 *   1. Creates a task linked to the lease (deduped by relatedTo/relatedId + title)
 *   2. Optionally sends email (SendGrid) and SMS (Twilio) to the tenant
 */

import type { Env } from '../env';
import { createDb } from '../db/connection';
import { SystemStorage } from '../storage/system';
import { SendGridClient, EMAIL_TEMPLATES } from './sendgrid';
import { TwilioClient, TEMPLATES as SMS_TEMPLATES } from './twilio';

const NOTIFICATION_WINDOWS = [
  { days: 90, taskTitle: 'Lease expiring in 90 days', smsTemplate: 'lease_reminder_90' as const },
  { days: 60, taskTitle: 'Lease expiring in 60 days', smsTemplate: 'lease_reminder_60' as const },
  { days: 30, taskTitle: 'Lease expiring in 30 days', smsTemplate: 'lease_reminder_30' as const },
];

function formatDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toISOString().split('T')[0];
}

export async function processLeaseExpirations(env: Env): Promise<{
  checked: number;
  tasksCreated: number;
  emailsSent: number;
  smsSent: number;
}> {
  const db = createDb(env.DATABASE_URL);
  const storage = new SystemStorage(db);

  const stats = { checked: 0, tasksCreated: 0, emailsSent: 0, smsSent: 0 };

  // Set up optional notification clients
  const sendgrid = env.SENDGRID_API_KEY && env.SENDGRID_FROM_EMAIL
    ? new SendGridClient({ apiKey: env.SENDGRID_API_KEY, fromEmail: env.SENDGRID_FROM_EMAIL })
    : null;
  const twilio = env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_PHONE_NUMBER
    ? new TwilioClient({ accountSid: env.TWILIO_ACCOUNT_SID, authToken: env.TWILIO_AUTH_TOKEN, fromNumber: env.TWILIO_PHONE_NUMBER })
    : null;

  // Process each notification window (90, 60, 30 days)
  for (const window of NOTIFICATION_WINDOWS) {
    const expiring = await storage.getExpiringLeases(window.days);
    stats.checked += expiring.length;

    for (const { lease, unit, property } of expiring) {
      // Dedup: check if a task already exists for this lease + window
      const existingTasks = await storage.getTasksByRelation('lease', lease.id);
      const alreadyNotified = existingTasks.some((t) => t.title === window.taskTitle);
      if (alreadyNotified) continue;

      // Create task for property manager
      await storage.createTask({
        tenantId: property.tenantId,
        title: window.taskTitle,
        description: `${lease.tenantName}'s lease at ${property.name} (Unit ${unit.unitNumber || 'N/A'}) expires ${formatDate(lease.endDate)}.`,
        dueDate: lease.endDate,
        priority: window.days <= 30 ? 'urgent' : window.days <= 60 ? 'high' : 'medium',
        status: 'pending',
        relatedTo: 'lease',
        relatedId: lease.id,
        metadata: {
          notificationWindow: window.days,
          leaseEndDate: formatDate(lease.endDate),
          propertyId: property.id,
          unitId: unit.id,
        },
      });
      stats.tasksCreated++;

      const endDateStr = formatDate(lease.endDate);

      // Send email notification if tenant has email and SendGrid is configured
      if (sendgrid && lease.tenantEmail) {
        try {
          const email = EMAIL_TEMPLATES.lease_reminder(lease.tenantName, property.name, endDateStr);
          await sendgrid.sendEmail({ to: lease.tenantEmail, ...email });
          stats.emailsSent++;
        } catch (err) {
          console.error(`Failed to send lease reminder email to ${lease.tenantEmail}:`, err);
        }
      }

      // Send SMS notification if tenant has phone and Twilio is configured
      if (twilio && lease.tenantPhone) {
        try {
          const smsBody = SMS_TEMPLATES[window.smsTemplate](lease.tenantName, endDateStr);
          await twilio.sendSms(lease.tenantPhone, smsBody);
          stats.smsSent++;
        } catch (err) {
          console.error(`Failed to send lease reminder SMS to ${lease.tenantPhone}:`, err);
        }
      }
    }
  }

  return stats;
}
