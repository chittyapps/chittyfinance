import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import { sendEmail } from '../lib/email';

export const emailRoutes = new Hono<HonoEnv>();

// POST /api/email/test — send a test email (auth required)
emailRoutes.post('/api/email/test', async (c) => {
  const { to, subject, body } = await c.req.json<{ to?: string; subject?: string; body?: string }>();

  const result = await sendEmail(c.env, {
    to: to ?? 'nick@aribia.llc',
    subject: subject ?? 'ChittyFinance Test Email',
    html: body ?? '<h2>Test</h2><p>Email service is working.</p>',
    text: 'Test — email service is working.',
  });

  return c.json(result);
});

// GET /api/email/status — check if email binding is configured
emailRoutes.get('/api/email/status', async (c) => {
  return c.json({
    configured: !!c.env.EMAIL,
    sender: 'finance@chitty.cc',
    service: 'cloudflare-email-service',
  });
});
