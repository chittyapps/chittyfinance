import { Hono } from 'hono';
import type { HonoEnv, Env } from '../env';
import { TwilioClient, TEMPLATES, type TemplateName } from '../lib/twilio';
import { SendGridClient, EMAIL_TEMPLATES } from '../lib/sendgrid';

export const commsRoutes = new Hono<HonoEnv>();

function getTwilioClient(env: Env) {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_PHONE_NUMBER) return null;
  return new TwilioClient({
    accountSid: env.TWILIO_ACCOUNT_SID,
    authToken: env.TWILIO_AUTH_TOKEN,
    fromNumber: env.TWILIO_PHONE_NUMBER,
  });
}

function getSendGridClient(env: Env) {
  if (!env.SENDGRID_API_KEY) return null;
  return new SendGridClient({
    apiKey: env.SENDGRID_API_KEY,
    fromEmail: env.SENDGRID_FROM_EMAIL || 'notifications@chitty.cc',
  });
}

// POST /api/comms/send — Send SMS or email
commsRoutes.post('/api/comms/send', async (c) => {
  const body = await c.req.json();
  const { channel, to, message, subject } = body as {
    channel: 'sms' | 'email';
    to: string;
    message: string;
    subject?: string;
  };

  if (!channel || !to || !message) {
    return c.json({ error: 'channel, to, and message are required' }, 400);
  }

  const env = c.env;

  if (channel === 'sms') {
    const twilio = getTwilioClient(env);
    if (!twilio) return c.json({ error: 'Twilio not configured' }, 503);

    const result = await twilio.sendSms(to, message);
    // Log to comms_log
    const storage = c.get('storage');
    const tenantId = c.get('tenantId');
    await storage.createCommsLog({
      tenantId,
      propertyId: body.propertyId,
      recipientName: body.recipientName || 'Unknown',
      recipientContact: to,
      channel: 'sms',
      template: body.template || null,
      body: message,
      status: result.status === 'queued' || result.status === 'sent' ? 'sent' : 'failed',
      metadata: { sid: result.sid },
    });

    return c.json({ success: true, sid: result.sid, status: result.status });
  }

  if (channel === 'email') {
    const sendgrid = getSendGridClient(env);
    if (!sendgrid) return c.json({ error: 'SendGrid not configured' }, 503);

    const result = await sendgrid.sendEmail({
      to,
      subject: subject || 'ChittyFinance Notification',
      html: message,
    });

    const storage = c.get('storage');
    const tenantId = c.get('tenantId');
    await storage.createCommsLog({
      tenantId,
      propertyId: body.propertyId,
      recipientName: body.recipientName || 'Unknown',
      recipientContact: to,
      channel: 'email',
      template: body.template || null,
      body: message,
      status: result.success ? 'sent' : 'failed',
      metadata: { statusCode: result.statusCode },
    });

    return c.json({ success: result.success });
  }

  return c.json({ error: `Unknown channel: ${channel}` }, 400);
});

// POST /api/comms/template — Send from template
commsRoutes.post('/api/comms/template', async (c) => {
  const body = await c.req.json();
  const { template, channel, to, params } = body as {
    template: TemplateName;
    channel: 'sms' | 'email';
    to: string;
    params: Record<string, string>;
  };

  if (!template || !channel || !to) {
    return c.json({ error: 'template, channel, and to are required' }, 400);
  }

  const env = c.env;

  if (channel === 'sms') {
    const twilio = getTwilioClient(env);
    if (!twilio) return c.json({ error: 'Twilio not configured' }, 503);

    const templateFn = TEMPLATES[template];
    if (!templateFn) return c.json({ error: `Unknown template: ${template}` }, 400);

    // Templates accept varying args — pass params values in order
    const args = Object.values(params);
    const message = (templateFn as (...a: string[]) => string)(...args);

    const result = await twilio.sendSms(to, message);
    return c.json({ success: true, sid: result.sid, message });
  }

  if (channel === 'email') {
    const sendgrid = getSendGridClient(env);
    if (!sendgrid) return c.json({ error: 'SendGrid not configured' }, 503);

    const emailTemplateFn = EMAIL_TEMPLATES[template as keyof typeof EMAIL_TEMPLATES];
    if (!emailTemplateFn) return c.json({ error: `Unknown email template: ${template}` }, 400);

    const args = Object.values(params);
    const { subject, html } = (emailTemplateFn as (...a: string[]) => { subject: string; html: string })(...args);

    const result = await sendgrid.sendEmail({ to, subject, html });
    return c.json({ success: result.success });
  }

  return c.json({ error: `Unknown channel: ${channel}` }, 400);
});

// GET /api/comms/history — Message history per property
commsRoutes.get('/api/comms/history', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const propertyId = c.req.query('propertyId');

  const logs = await storage.getCommsLog(tenantId, propertyId ?? undefined);
  return c.json(logs);
});

// GET /api/comms/status — Check Twilio/SendGrid configuration
commsRoutes.get('/api/comms/status', async (c) => {
  const env = c.env;
  return c.json({
    twilio: !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_PHONE_NUMBER),
    sendgrid: !!env.SENDGRID_API_KEY,
  });
});
