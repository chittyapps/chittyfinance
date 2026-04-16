import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import { centralWorkflowLog } from '../lib/central-workflows';

export const workflowRoutes = new Hono<HonoEnv>();

// GET /api/workflows — List workflows by property
workflowRoutes.get('/api/workflows', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const propertyId = c.req.query('propertyId');

  const workflows = await storage.getWorkflows(tenantId, propertyId ?? undefined);
  return c.json(workflows);
});

// POST /api/workflows — Create workflow (maintenance request, expense approval, etc.)
workflowRoutes.post('/api/workflows', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const body = await c.req.json();

  const workflow = await storage.createWorkflow({
    tenantId,
    propertyId: body.propertyId,
    type: body.type || 'maintenance_request',
    title: body.title,
    description: body.description,
    requestor: body.requestor,
    costEstimate: body.costEstimate,
    status: 'requested',
    metadata: body.metadata,
  });

  centralWorkflowLog(c, {
    aggregateId: workflow.id,
    tenantId,
    workflowType: workflow.type,
    title: workflow.title,
    description: workflow.description,
    status: workflow.status,
    claimable: true,
    lane: workflow.status === 'requested' ? 'approvals' : 'progress',
    metadata: {
      propertyId: workflow.propertyId,
      requestor: workflow.requestor,
      costEstimate: workflow.costEstimate,
      localTable: 'workflows',
    },
  }, c.env);

  return c.json(workflow, 201);
});

// PATCH /api/workflows/:id — Update workflow status
workflowRoutes.patch('/api/workflows/:id', async (c) => {
  const storage = c.get('storage');
  const id = c.req.param('id');
  const body = await c.req.json();

  const workflow = await storage.updateWorkflow(id, {
    status: body.status,
    metadata: body.metadata,
  });

  if (!workflow) return c.json({ error: 'Workflow not found' }, 404);

  centralWorkflowLog(c, {
    aggregateId: workflow.id,
    tenantId: workflow.tenantId,
    workflowType: workflow.type,
    title: workflow.title,
    description: workflow.description,
    status: workflow.status,
    lane: workflow.status === 'requested' ? 'approvals' : 'progress',
    metadata: {
      propertyId: workflow.propertyId,
      localTable: 'workflows',
      syncSource: 'PATCH /api/workflows/:id',
    },
  }, c.env);

  return c.json(workflow);
});

// PATCH /api/workflows/:id/approve — Approve a workflow
workflowRoutes.patch('/api/workflows/:id/approve', async (c) => {
  const storage = c.get('storage');
  const id = c.req.param('id');

  const workflow = await storage.updateWorkflow(id, {
    status: 'approved',
    metadata: { approvedAt: new Date().toISOString(), approvedBy: c.get('userId') },
  });

  if (!workflow) return c.json({ error: 'Workflow not found' }, 404);

  centralWorkflowLog(c, {
    aggregateId: workflow.id,
    tenantId: workflow.tenantId,
    workflowType: workflow.type,
    title: workflow.title,
    description: workflow.description,
    status: workflow.status,
    claimable: true,
    lane: 'approvals',
    metadata: {
      propertyId: workflow.propertyId,
      localTable: 'workflows',
      syncSource: 'PATCH /api/workflows/:id/approve',
    },
  }, c.env);

  return c.json(workflow);
});

// PATCH /api/workflows/:id/complete — Complete a workflow
workflowRoutes.patch('/api/workflows/:id/complete', async (c) => {
  const storage = c.get('storage');
  const id = c.req.param('id');

  const workflow = await storage.updateWorkflow(id, {
    status: 'completed',
    metadata: { completedAt: new Date().toISOString() },
  });

  if (!workflow) return c.json({ error: 'Workflow not found' }, 404);

  centralWorkflowLog(c, {
    aggregateId: workflow.id,
    tenantId: workflow.tenantId,
    workflowType: workflow.type,
    title: workflow.title,
    description: workflow.description,
    status: workflow.status,
    claimable: false,
    lane: 'progress',
    metadata: {
      propertyId: workflow.propertyId,
      localTable: 'workflows',
      syncSource: 'PATCH /api/workflows/:id/complete',
    },
  }, c.env);

  return c.json(workflow);
});
