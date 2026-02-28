import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import { ledgerLog } from '../lib/ledger-client';

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

// POST /api/ai/property-advice — AI advisor for a specific property
aiRoutes.post('/api/ai/property-advice', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const body = await c.req.json();
  const { propertyId, message } = body;

  if (!propertyId || !message) {
    return c.json({ error: 'propertyId and message are required' }, 400);
  }

  let property: any, financials: any;
  try {
    property = await storage.getProperty(propertyId, tenantId);
    financials = await storage.getPropertyFinancials(propertyId, tenantId);
  } catch {}

  if (!property) {
    return c.json({ error: 'Property not found' }, 404);
  }

  const context = {
    property: {
      name: property.name,
      address: property.address,
      type: property.propertyType,
      currentValue: property.currentValue,
    },
    financials: financials || null,
  };

  // Try ChittyAgent first, fall back to rule-based
  let response: { role: string; content: string; model: string | null; provider: string };

  const agentBase = c.env.CHITTYAGENT_API_BASE;
  const agentToken = c.env.CHITTYAGENT_API_TOKEN;
  let agentUsed = false;

  if (agentBase && agentToken) {
    try {
      const agentRes = await fetch(`${agentBase}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${agentToken}`,
        },
        body: JSON.stringify({ context, message, service: 'chittyfinance' }),
      });
      if (agentRes.ok) {
        const data = (await agentRes.json()) as any;
        response = {
          role: 'assistant',
          content: data.content || data.message,
          model: data.model,
          provider: 'chittyagent',
        };
        agentUsed = true;
      }
    } catch {}
  }

  if (!agentUsed) {
    const capRateInfo = financials?.capRate
      ? `Your property has a cap rate of ${financials.capRate.toFixed(1)}%.`
      : '';
    const noiInfo = financials?.noi
      ? `Current NOI is $${financials.noi.toLocaleString()}.`
      : '';
    response = {
      role: 'assistant',
      content: `Based on the data for ${property.name}: ${capRateInfo} ${noiInfo} For detailed analysis, please configure ChittyAgent or OpenAI.`,
      model: null,
      provider: 'rule-based',
    };
  }

  ledgerLog(c, {
    entityType: 'audit',
    entityId: propertyId,
    action: 'ai.property-advice',
    metadata: { tenantId, provider: response!.provider, model: response!.model, messageLength: message.length, responseLength: response!.content.length },
  }, c.env);

  return c.json(response!);
});
