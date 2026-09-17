import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { HonoEnv } from '../env';

// vi.mock() is hoisted above every const in this file, so any fn referenced
// from inside a factory must come from vi.hoisted() -- otherwise the factory
// runs first and throws "Cannot access '<name>' before initialization", which
// fails the whole file at collection time rather than as a readable assertion.
const {
  mockGetAuthorizationUrl,
  mockExchangeCodeForToken,
  mockGetBusinesses,
  mockSetAccessToken,
  mockRefreshAccessToken,
  mockGenerateOAuthState,
  mockValidateOAuthState,
  mockCreateIntegration,
  mockUpdateIntegration,
  mockGetIntegrationsStorage,
} = vi.hoisted(() => ({
  mockGetAuthorizationUrl: vi.fn().mockReturnValue('https://api.waveapps.com/oauth2/authorize/?mock=1'),
  mockExchangeCodeForToken: vi.fn(),
  mockGetBusinesses: vi.fn(),
  mockSetAccessToken: vi.fn(),
  mockRefreshAccessToken: vi.fn(),
  mockGenerateOAuthState: vi.fn().mockResolvedValue('mock-payload.mock-signature'),
  mockValidateOAuthState: vi.fn(),
  mockCreateIntegration: vi.fn().mockResolvedValue({}),
  mockUpdateIntegration: vi.fn().mockResolvedValue({}),
  mockGetIntegrationsStorage: vi.fn().mockResolvedValue([]),
}));

// Vitest 4 refuses to `new` a vi.fn() whose implementation is an arrow
// function ("did not use 'function' or 'class' in its implementation"), which
// is what silently turned every route that constructs a client into a 500.
// Both constructor stand-ins below are real classes for that reason.
vi.mock('../lib/wave-api', () => ({
  WaveAPIClient: class MockWaveAPIClient {
    getAuthorizationUrl = mockGetAuthorizationUrl;
    exchangeCodeForToken = mockExchangeCodeForToken;
    getBusinesses = mockGetBusinesses;
    setAccessToken = mockSetAccessToken;
    refreshAccessToken = mockRefreshAccessToken;
  },
}));

vi.mock('../lib/oauth-state-edge', () => ({
  generateOAuthState: mockGenerateOAuthState,
  validateOAuthState: mockValidateOAuthState,
}));

vi.mock('../db/connection', () => ({
  createDb: vi.fn().mockReturnValue({}),
}));

vi.mock('../storage/system', () => ({
  SystemStorage: class MockSystemStorage {
    getIntegrations = mockGetIntegrationsStorage;
    createIntegration = mockCreateIntegration;
    updateIntegration = mockUpdateIntegration;
  },
}));

import { waveRoutes, waveCallbackRoute } from '../routes/wave';

const baseEnv = {
  CHITTY_AUTH_SERVICE_TOKEN: 'svc-token',
  DATABASE_URL: 'postgres://fake/db',
  FINANCE_KV: {} as any,
  FINANCE_R2: {} as any,
  ASSETS: {} as any,
};

const configuredEnv = {
  ...baseEnv,
  WAVE_CLIENT_ID: 'wave-client-id',
  WAVE_CLIENT_SECRET: 'wave-client-secret',
  OAUTH_STATE_SECRET: 'super-secret-32-chars-minimum-ok',
};

function buildAuthorizeApp() {
  const app = new Hono<HonoEnv>();
  app.use('*', async (c, next) => {
    c.set('tenantId', 'tenant-1');
    c.set('storage', {} as any);
    await next();
  });
  app.route('/', waveRoutes);
  return app;
}

function buildRefreshApp(storageOverrides: Record<string, any> = {}) {
  const mockStorage = {
    getIntegrations: vi.fn().mockResolvedValue([]),
    updateIntegration: vi.fn().mockResolvedValue({}),
    ...storageOverrides,
  };
  const app = new Hono<HonoEnv>();
  app.use('*', async (c, next) => {
    c.set('tenantId', 'tenant-1');
    c.set('storage', mockStorage as any);
    await next();
  });
  app.route('/', waveRoutes);
  return { app, mockStorage };
}

function buildCallbackApp() {
  const app = new Hono<HonoEnv>();
  app.route('/', waveCallbackRoute);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Restore defaults after clearAllMocks
  mockGetAuthorizationUrl.mockReturnValue('https://api.waveapps.com/oauth2/authorize/?mock=1');
  mockGenerateOAuthState.mockResolvedValue('mock-payload.mock-signature');
  mockValidateOAuthState.mockResolvedValue(null);
  mockGetIntegrationsStorage.mockResolvedValue([]);
});

// ─── GET /api/integrations/wave/authorize ────────────────────────────────────

describe('GET /api/integrations/wave/authorize', () => {
  it('returns 503 when WAVE_CLIENT_ID is not configured', async () => {
    const app = buildAuthorizeApp();
    const res = await app.request('/api/integrations/wave/authorize', {}, baseEnv);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error).toContain('not configured');
  });

  it('returns 503 when only WAVE_CLIENT_ID is set but WAVE_CLIENT_SECRET is missing', async () => {
    const app = buildAuthorizeApp();
    const envWithoutSecret = { ...baseEnv, WAVE_CLIENT_ID: 'some-client-id' };
    const res = await app.request('/api/integrations/wave/authorize', {}, envWithoutSecret);
    expect(res.status).toBe(503);
  });

  it('returns 200 with authUrl when Wave credentials are configured', async () => {
    const app = buildAuthorizeApp();
    const res = await app.request('/api/integrations/wave/authorize', {}, configuredEnv);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authUrl).toBeDefined();
    expect(typeof body.authUrl).toBe('string');
    expect(body.authUrl.length).toBeGreaterThan(0);
  });

  it('returns an authUrl pointing to waveapps OAuth', async () => {
    const app = buildAuthorizeApp();
    const res = await app.request('/api/integrations/wave/authorize', {}, configuredEnv);
    const body = await res.json();
    expect(body.authUrl).toContain('waveapps.com');
  });

  it('does not include authUrl in a 503 error response', async () => {
    const app = buildAuthorizeApp();
    const res = await app.request('/api/integrations/wave/authorize', {}, baseEnv);
    const body = await res.json();
    expect(body.authUrl).toBeUndefined();
  });

  it('calls generateOAuthState with the tenantId', async () => {
    const app = buildAuthorizeApp();
    await app.request('/api/integrations/wave/authorize', {}, configuredEnv);
    expect(mockGenerateOAuthState).toHaveBeenCalledWith('tenant-1', expect.any(String));
  });
});

// ─── GET /api/integrations/wave/callback ─────────────────────────────────────

describe('GET /api/integrations/wave/callback', () => {
  it('redirects to error URL when error query param is present', async () => {
    const app = buildCallbackApp();
    const res = await app.request(
      '/api/integrations/wave/callback?error=access_denied',
      {},
      baseEnv
    );
    expect(res.status).toBe(302);
    const location = res.headers.get('location');
    expect(location).toContain('wave=error');
    expect(location).toContain('access_denied');
  });

  it('redirects with missing_params when code is absent', async () => {
    const app = buildCallbackApp();
    const res = await app.request(
      '/api/integrations/wave/callback?state=some-state',
      {},
      baseEnv
    );
    expect(res.status).toBe(302);
    const location = res.headers.get('location');
    expect(location).toContain('wave=error');
    expect(location).toContain('missing_params');
  });

  it('redirects with missing_params when state is absent', async () => {
    const app = buildCallbackApp();
    const res = await app.request(
      '/api/integrations/wave/callback?code=auth-code-123',
      {},
      baseEnv
    );
    expect(res.status).toBe(302);
    const location = res.headers.get('location');
    expect(location).toContain('wave=error');
    expect(location).toContain('missing_params');
  });

  it('redirects with invalid_state when state validation fails', async () => {
    mockValidateOAuthState.mockResolvedValue(null); // Simulate invalid state
    const app = buildCallbackApp();
    // configuredEnv, not baseEnv: the route checks OAUTH_STATE_SECRET before it
    // validates the state, so a secret-less env short-circuits to
    // server_misconfigured and this test would pass through a path it is not
    // testing. That guard gets its own case below.
    const res = await app.request(
      '/api/integrations/wave/callback?code=auth-code&state=tampered-state',
      {},
      configuredEnv
    );
    expect(res.status).toBe(302);
    const location = res.headers.get('location');
    expect(location).toContain('wave=error');
    expect(location).toContain('invalid_state');
    expect(mockValidateOAuthState).toHaveBeenCalled();
  });

  it('redirects with server_misconfigured when OAUTH_STATE_SECRET is absent', async () => {
    const app = buildCallbackApp();
    const res = await app.request(
      '/api/integrations/wave/callback?code=auth-code&state=some-state',
      {},
      baseEnv
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('server_misconfigured');
    // and it must fail before touching the state at all
    expect(mockValidateOAuthState).not.toHaveBeenCalled();
  });

  it('uses PUBLIC_APP_BASE_URL for the redirect base URL', async () => {
    const app = buildCallbackApp();
    const envWithBase = { ...baseEnv, PUBLIC_APP_BASE_URL: 'https://custom.example.com' };
    const res = await app.request(
      '/api/integrations/wave/callback?error=denied',
      {},
      envWithBase
    );
    const location = res.headers.get('location');
    expect(location).toContain('custom.example.com');
  });

  it('falls back to finance.chitty.cc when PUBLIC_APP_BASE_URL is not set', async () => {
    const app = buildCallbackApp();
    const res = await app.request(
      '/api/integrations/wave/callback?error=denied',
      {},
      baseEnv
    );
    const location = res.headers.get('location');
    expect(location).toContain('finance.chitty.cc');
  });

  it('error redirect preserves the error reason from Wave', async () => {
    const app = buildCallbackApp();
    const res = await app.request(
      '/api/integrations/wave/callback?error=user_denied_access',
      {},
      baseEnv
    );
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('user_denied_access');
  });
});

// ─── POST /api/integrations/wave/refresh ─────────────────────────────────────

describe('POST /api/integrations/wave/refresh', () => {
  it('returns 404 when no integrations exist', async () => {
    const { app } = buildRefreshApp({ getIntegrations: vi.fn().mockResolvedValue([]) });
    const res = await app.request('/api/integrations/wave/refresh', { method: 'POST' }, configuredEnv);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('returns 404 when no Wave (wavapps) integration is found', async () => {
    const { app } = buildRefreshApp({
      getIntegrations: vi.fn().mockResolvedValue([
        { id: 'i1', serviceType: 'stripe', connected: true, credentials: {} },
        { id: 'i2', serviceType: 'mercury', connected: true, credentials: {} },
      ]),
    });
    const res = await app.request('/api/integrations/wave/refresh', { method: 'POST' }, configuredEnv);
    expect(res.status).toBe(404);
  });

  it('returns 400 when Wave integration has no refresh_token in credentials', async () => {
    const { app } = buildRefreshApp({
      getIntegrations: vi.fn().mockResolvedValue([
        {
          id: 'i1',
          serviceType: 'wavapps',
          connected: true,
          credentials: { access_token: 'tok', business_id: 'biz-1' }, // no refresh_token
        },
      ]),
    });
    const res = await app.request('/api/integrations/wave/refresh', { method: 'POST' }, configuredEnv);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('refresh token');
  });

  it('returns 400 when credentials are empty', async () => {
    const { app } = buildRefreshApp({
      getIntegrations: vi.fn().mockResolvedValue([
        { id: 'i1', serviceType: 'wavapps', connected: true, credentials: {} },
      ]),
    });
    const res = await app.request('/api/integrations/wave/refresh', { method: 'POST' }, configuredEnv);
    expect(res.status).toBe(400);
  });

  it('returns 200 with success message when token refresh succeeds', async () => {
    mockRefreshAccessToken.mockResolvedValue({
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      expires_in: 3600,
    });

    const { app } = buildRefreshApp({
      getIntegrations: vi.fn().mockResolvedValue([
        {
          id: 'i1',
          serviceType: 'wavapps',
          connected: true,
          credentials: {
            access_token: 'old-token',
            refresh_token: 'old-refresh-token',
            business_id: 'biz-1',
          },
        },
      ]),
    });
    const res = await app.request('/api/integrations/wave/refresh', { method: 'POST' }, configuredEnv);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBeDefined();
    expect(body.message.toLowerCase()).toContain('refresh');
  });

  it('updates the integration record with new tokens on success', async () => {
    mockRefreshAccessToken.mockResolvedValue({
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      expires_in: 7200,
    });

    const updateIntegration = vi.fn().mockResolvedValue({});
    const { app } = buildRefreshApp({
      getIntegrations: vi.fn().mockResolvedValue([
        {
          id: 'wave-integration-id',
          serviceType: 'wavapps',
          connected: true,
          credentials: {
            access_token: 'old-token',
            refresh_token: 'old-refresh-token',
            business_id: 'biz-1',
          },
        },
      ]),
      updateIntegration,
    });
    await app.request('/api/integrations/wave/refresh', { method: 'POST' }, configuredEnv);

    expect(updateIntegration).toHaveBeenCalledWith(
      'wave-integration-id',
      expect.objectContaining({
        credentials: expect.objectContaining({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
        }),
      })
    );
  });

  it('preserves existing credential fields when updating tokens', async () => {
    mockRefreshAccessToken.mockResolvedValue({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      expires_in: 3600,
    });

    const updateIntegration = vi.fn().mockResolvedValue({});
    const { app } = buildRefreshApp({
      getIntegrations: vi.fn().mockResolvedValue([
        {
          id: 'i-abc',
          serviceType: 'wavapps',
          connected: true,
          credentials: {
            access_token: 'old-access',
            refresh_token: 'old-refresh',
            business_id: 'biz-123',
            business_name: 'My Business',
          },
        },
      ]),
      updateIntegration,
    });
    await app.request('/api/integrations/wave/refresh', { method: 'POST' }, configuredEnv);

    expect(updateIntegration).toHaveBeenCalledWith(
      'i-abc',
      expect.objectContaining({
        credentials: expect.objectContaining({
          business_id: 'biz-123',
          business_name: 'My Business',
        }),
      })
    );
  });

  it('returns 500 when the Wave API throws during token refresh', async () => {
    mockRefreshAccessToken.mockRejectedValue(new Error('Wave API unavailable'));

    const { app } = buildRefreshApp({
      getIntegrations: vi.fn().mockResolvedValue([
        {
          id: 'i1',
          serviceType: 'wavapps',
          connected: true,
          credentials: {
            access_token: 'old-token',
            refresh_token: 'old-refresh-token',
          },
        },
      ]),
    });
    const res = await app.request('/api/integrations/wave/refresh', { method: 'POST' }, configuredEnv);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});