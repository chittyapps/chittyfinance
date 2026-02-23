import { describe, it, expect } from 'vitest';

describe('Env type', () => {
  it('exports Env interface and HonoEnv type', async () => {
    const mod = await import('../env');
    expect(mod).toBeDefined();
  });
});
