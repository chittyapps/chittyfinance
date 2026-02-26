import { Hono } from 'hono';
import type { HonoEnv } from '../env';

export const taskRoutes = new Hono<HonoEnv>();

// GET /api/tasks — list tasks for the tenant
taskRoutes.get('/api/tasks', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');

  const tasks = await storage.getTasks(tenantId);
  return c.json(tasks);
});

// POST /api/tasks — create a new task
taskRoutes.post('/api/tasks', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const body = await c.req.json();

  if (!body.title) {
    return c.json({ error: 'title is required' }, 400);
  }

  const task = await storage.createTask({
    tenantId,
    userId: body.userId || userId || null,
    title: body.title,
    description: body.description || null,
    dueDate: body.dueDate ? new Date(body.dueDate) : null,
    priority: body.priority || null,
    status: body.status || 'pending',
    relatedTo: body.relatedTo || null,
    relatedId: body.relatedId || null,
    metadata: body.metadata || null,
  });

  return c.json(task, 201);
});

// PATCH /api/tasks/:id — update a task
taskRoutes.patch('/api/tasks/:id', async (c) => {
  const storage = c.get('storage');
  const id = c.req.param('id');

  const existing = await storage.getTask(id);
  if (!existing) {
    return c.json({ error: 'Task not found' }, 404);
  }

  const body = await c.req.json();
  const updated = await storage.updateTask(id, body);
  return c.json(updated);
});

// DELETE /api/tasks/:id — delete a task
taskRoutes.delete('/api/tasks/:id', async (c) => {
  const storage = c.get('storage');
  const id = c.req.param('id');

  const existing = await storage.getTask(id);
  if (!existing) {
    return c.json({ error: 'Task not found' }, 404);
  }

  await storage.deleteTask(id);
  return c.json({ deleted: true });
});
