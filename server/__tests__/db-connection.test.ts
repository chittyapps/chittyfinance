import { describe, it, expect } from 'vitest';

describe('createDb', () => {
  it('exports createDb function', async () => {
    const { createDb } = await import('../db/connection');
    expect(typeof createDb).toBe('function');
  });

  it('returns a drizzle instance when given a connection string', async () => {
    const { createDb } = await import('../db/connection');
    const db = createDb('postgresql://fake:fake@localhost/fake');
    expect(db).toBeDefined();
    expect(db.select).toBeDefined();
  });
});
