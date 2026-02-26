import { Hono } from 'hono';
import type { HonoEnv } from '../env';

export const aiRoutes = new Hono<HonoEnv>();

// GET /api/ai-messages — list AI conversation messages for the tenant
aiRoutes.get('/api/ai-messages', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');

  const messages = await storage.getAiMessages(tenantId);
  return c.json(messages);
});

// POST /api/ai-messages — create a new AI message (user or assistant)
aiRoutes.post('/api/ai-messages', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const body = await c.req.json();

  if (!body.content || !body.role) {
    return c.json({ error: 'content and role are required' }, 400);
  }

  const message = await storage.createAiMessage({
    tenantId,
    userId: body.userId || userId,
    content: body.content,
    role: body.role,
    metadata: body.metadata || null,
  });

  return c.json(message, 201);
});
