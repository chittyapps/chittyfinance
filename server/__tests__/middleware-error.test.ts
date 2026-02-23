import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

describe('errorHandler middleware', () => {
  it('catches thrown errors and returns JSON', async () => {
    const { errorHandler } = await import('../middleware/error');
    const app = new Hono();
    app.onError(errorHandler);
    app.get('/explode', () => {
      throw new Error('kaboom');
    });

    const res = await app.request('/explode');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('kaboom');
  });

  it('uses status from HTTPException', async () => {
    const { errorHandler } = await import('../middleware/error');
    const app = new Hono();
    app.onError(errorHandler);
    app.get('/forbidden', () => {
      throw new HTTPException(403, { message: 'no access' });
    });

    const res = await app.request('/forbidden');
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('no access');
  });
});
