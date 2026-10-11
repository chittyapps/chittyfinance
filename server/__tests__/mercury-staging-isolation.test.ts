import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { mercuryConnectBase } from '../routes/mercury';

describe('Mercury staging cannot inherit production provider routing or stores', () => {
  it('fails closed if staging has missing, production, or malformed Connect endpoint', () => {
    for (const base of [
      undefined, '', 'https://connect.chitty.cc', 'https://connect.chitty.cc/api',
      'https://example.net', 'http://chittyconnect-staging.example.net', 'not-a-url',
    ]) {
      expect(mercuryConnectBase({
        NODE_ENV: 'staging', CHITTYCONNECT_API_BASE: base,
      })).toBeNull();
    }
  });

  it('does not change the existing production Connect endpoint', () => {
    expect(mercuryConnectBase({
      NODE_ENV: 'production', CHITTYCONNECT_API_BASE: 'https://connect.chitty.cc',
    })).toBe('https://connect.chitty.cc');
  });

  it('staging configurations use EXISTING preview storage, never production KV/R2', () => {
    for (const path of ['../../wrangler.jsonc', '../../deploy/system-wrangler.jsonc']) {
      const source = readFileSync(new URL(path, import.meta.url), 'utf8');
      const staging = source.split('"staging": {')[1]?.split('"production": {')[0];
      expect(staging).toBeTruthy();
      expect(staging).toContain('89d0b3bc875e49c4a3a9091de6a080aa');
      expect(staging).toContain('"bucket_name": "chittyfinance-storage-preview"');
      expect(staging).not.toContain('517b63be4d7144c197b5bdf851f12041');
      expect(staging).not.toContain('"bucket_name": "chittyfinance-storage"');
      expect(staging).not.toContain('"CHITTYCONNECT_API_BASE": "https://connect.chitty.cc"');
    }
  });
});
