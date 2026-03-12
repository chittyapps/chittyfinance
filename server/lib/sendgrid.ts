/**
 * SendGrid email client — edge-compatible (uses fetch, no Node.js deps)
 */

interface SendGridConfig {
  apiKey: string;
  fromEmail: string;
  fromName?: string;
}

interface SendEmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

interface SendEmailResult {
  statusCode: number;
  success: boolean;
}

export class SendGridClient {
  constructor(private config: SendGridConfig) {}

  async sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
    const body = {
      personalizations: [{ to: [{ email: opts.to }] }],
      from: { email: this.config.fromEmail, name: this.config.fromName || 'ChittyFinance' },
      subject: opts.subject,
      content: [
        ...(opts.text ? [{ type: 'text/plain', value: opts.text }] : []),
        ...(opts.html ? [{ type: 'text/html', value: opts.html }] : []),
      ],
    };

    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    return { statusCode: res.status, success: res.status >= 200 && res.status < 300 };
  }
}

// Email templates
export const EMAIL_TEMPLATES = {
  lease_reminder: (tenantName: string, propertyName: string, endDate: string) => ({
    subject: `Lease Renewal Reminder - ${propertyName}`,
    html: `
      <h2>Lease Renewal Reminder</h2>
      <p>Hi ${tenantName},</p>
      <p>Your lease at <strong>${propertyName}</strong> expires on <strong>${endDate}</strong>.</p>
      <p>Please contact us to discuss your renewal options. We'd love to have you stay!</p>
      <p>Best regards,<br/>Property Management</p>
    `,
  }),

  maintenance_update: (tenantName: string, propertyName: string, description: string, date: string) => ({
    subject: `Maintenance Update - ${propertyName}`,
    html: `
      <h2>Maintenance Update</h2>
      <p>Hi ${tenantName},</p>
      <p>Maintenance work is scheduled for <strong>${date}</strong> at <strong>${propertyName}</strong>:</p>
      <p><em>${description}</em></p>
      <p>Please ensure access to your unit during the scheduled time.</p>
      <p>Best regards,<br/>Property Management</p>
    `,
  }),

  rent_receipt: (tenantName: string, amount: string, date: string, propertyName: string) => ({
    subject: `Rent Payment Received - ${propertyName}`,
    html: `
      <h2>Payment Confirmation</h2>
      <p>Hi ${tenantName},</p>
      <p>We've received your rent payment of <strong>$${amount}</strong> on <strong>${date}</strong> for <strong>${propertyName}</strong>.</p>
      <p>Thank you for your timely payment!</p>
      <p>Best regards,<br/>Property Management</p>
    `,
  }),

  questionnaire: (tenantName: string, propertyName: string, link: string) => ({
    subject: `Quick Survey - ${propertyName}`,
    html: `
      <h2>We'd Love Your Feedback</h2>
      <p>Hi ${tenantName},</p>
      <p>We recently completed maintenance work at <strong>${propertyName}</strong>. We'd appreciate your feedback.</p>
      <p><a href="${link}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;">Take Survey</a></p>
      <p>Thank you!<br/>Property Management</p>
    `,
  }),

  approval_request: (approverName: string, description: string, amount: string) => ({
    subject: `Approval Needed: ${description}`,
    html: `
      <h2>Approval Request</h2>
      <p>Hi ${approverName},</p>
      <p>A new request requires your approval:</p>
      <ul>
        <li><strong>Description:</strong> ${description}</li>
        <li><strong>Estimated Cost:</strong> $${amount}</li>
      </ul>
      <p>Please log in to ChittyFinance to review and approve.</p>
      <p>Best regards,<br/>ChittyFinance</p>
    `,
  }),
} as const;
