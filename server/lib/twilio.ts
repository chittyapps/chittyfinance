/**
 * Twilio SMS client — edge-compatible (uses fetch, no Node.js deps)
 */

interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

interface SendSmsResult {
  sid: string;
  status: string;
  to: string;
}

export class TwilioClient {
  private baseUrl: string;
  private authHeader: string;

  constructor(private config: TwilioConfig) {
    this.baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}`;
    this.authHeader = `Basic ${btoa(`${config.accountSid}:${config.authToken}`)}`;
  }

  async sendSms(to: string, body: string): Promise<SendSmsResult> {
    const res = await fetch(`${this.baseUrl}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: to,
        From: this.config.fromNumber,
        Body: body,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Twilio send failed (${res.status}): ${err}`);
    }

    const data: Record<string, string> = await res.json();
    return { sid: data.sid, status: data.status, to: data.to };
  }
}

// Message templates
export const TEMPLATES = {
  lease_reminder_90: (tenantName: string, endDate: string) =>
    `Hi ${tenantName}, this is a reminder that your lease ends on ${endDate}. Please contact us to discuss renewal options.`,

  lease_reminder_60: (tenantName: string, endDate: string) =>
    `Hi ${tenantName}, your lease expires in 60 days (${endDate}). Let's schedule a time to talk about your plans.`,

  lease_reminder_30: (tenantName: string, endDate: string) =>
    `Hi ${tenantName}, your lease ends in 30 days (${endDate}). If you haven't already, please let us know if you'd like to renew.`,

  maintenance_scheduled: (tenantName: string, date: string, description: string) =>
    `Hi ${tenantName}, maintenance work is scheduled for ${date}: ${description}. Please ensure access to your unit.`,

  rent_receipt: (tenantName: string, amount: string, date: string) =>
    `Hi ${tenantName}, we've received your rent payment of $${amount} on ${date}. Thank you!`,

  questionnaire: (tenantName: string, link: string) =>
    `Hi ${tenantName}, please take a moment to complete this brief survey about your recent maintenance experience: ${link}`,

  approval_request: (approverName: string, description: string) =>
    `Hi ${approverName}, approval needed: ${description}. Please review in ChittyFinance.`,

  move_in_checklist: (tenantName: string, date: string) =>
    `Hi ${tenantName}, your move-in is scheduled for ${date}. Here's your checklist — please review before arrival.`,
} as const;

export type TemplateName = keyof typeof TEMPLATES;
