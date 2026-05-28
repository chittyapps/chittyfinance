import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import {
  buildConsolidatedReport,
  buildPreflightChecks,
  buildRemediationPrompts,
  detectTransactionState,
  parseStateTaxRates,
  type ConsolidatedReportOptions,
  type ReportingAccountRow,
  type ReportingTransactionRow,
} from '../lib/consolidated-reporting';
import { scopeLog } from '../lib/central-workflows';
import { ledgerLog } from '../lib/ledger-client';

export const reportRoutes = new Hono<HonoEnv>();

function parseBool(value: unknown, defaultValue: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function parseCsv(value: unknown): string[] {
  if (!value || typeof value !== 'string') return [];
  return value.split(',').map((v) => v.trim()).filter(Boolean);
}

function parseRate(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : parseFloat(String(value));
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

function normalizeDateInput(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Dates must use YYYY-MM-DD format.');
  }
  return value;
}

async function generateAiReview(
  env: HonoEnv['Bindings'],
  payload: {
    report: ReturnType<typeof buildConsolidatedReport>;
    checks: ReturnType<typeof buildPreflightChecks>;
    prompts: string[];
  },
) {
  const warningCount = payload.checks.checks.filter((c) => c.status === 'warn').length;
  const failCount = payload.checks.checks.filter((c) => c.status === 'fail').length;

  const fallback = [
    `Tax readiness: ${payload.checks.readyToFileTaxes ? 'READY' : 'NOT READY'}.`,
    `Scope: ${payload.report.scope.tenantIds.length} entities, ${payload.report.byState.length} states.`,
    `Quality: ${warningCount} warnings, ${failCount} failures.`,
    payload.prompts.length > 0
      ? `Top remediation: ${payload.prompts[0]}`
      : 'No remediation prompts generated.',
  ].join(' ');

  const agentBase = env.CHITTYAGENT_API_BASE;
  const agentToken = env.CHITTYAGENT_API_TOKEN;
  if (!agentBase || !agentToken) {
    return { provider: 'rule-based', content: fallback };
  }

  try {
    const response = await fetch(`${agentBase.replace(/\/$/, '')}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${agentToken}`,
      },
      body: JSON.stringify({
        service: 'chittyfinance',
        context: {
          totals: payload.report.totals,
          quality: payload.report.quality,
          checks: payload.checks.checks,
          prompts: payload.prompts,
        },
        message: 'Produce a concise tax-close readiness review with top risks and next actions.',
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return { provider: 'rule-based', content: fallback };
    }

    const data = await response.json() as Record<string, unknown>;
    const content =
      (typeof data.content === 'string' && data.content) ||
      (typeof data.response === 'string' && data.response) ||
      fallback;

    return { provider: 'chittyagent', content };
  } catch {
    return { provider: 'rule-based', content: fallback };
  }
}

async function buildReportForRequest(
  storage: any,
  tenantId: string,
  params: {
    startDate: string;
    endDate: string;
    includeDescendants: boolean;
    includeIntercompany: boolean;
    strictReadiness: boolean;
    stateFilter: string[];
    entityTypes: string[];
    federalTaxRate?: number;
    defaultStateTaxRate?: number;
    stateTaxRates?: Record<string, number>;
  },
) {
  let tenantIds = params.includeDescendants
    ? await storage.getTenantDescendantIds(tenantId)
    : [tenantId];

  if (params.entityTypes.length > 0) {
    const tenants = await storage.getTenantsByIds(tenantIds);
    const allowed = new Set(params.entityTypes.map((value) => value.toLowerCase()));
    tenantIds = tenants
      .filter((tenant: any) => allowed.has(String(tenant.type || '').toLowerCase()))
      .map((tenant: any) => tenant.id);
  }

  const startDateIso = `${params.startDate}T00:00:00.000Z`;
  const endDateIso = `${params.endDate}T23:59:59.999Z`;

  let transactions = await storage.getTransactionsForTenantScope(
    tenantIds,
    startDateIso,
    endDateIso,
    params.entityTypes,
  ) as ReportingTransactionRow[];

  if (params.stateFilter.length > 0) {
    const allowedStates = new Set(params.stateFilter.map((value) => value.trim().toUpperCase()));
    transactions = transactions.filter((tx) => allowedStates.has(detectTransactionState(tx)));
  }

  let eliminatedIntercompanyCount = 0;
  if (!params.includeIntercompany) {
    const internalLinks = await storage.getInternalIntercompanyLinkedTransactionIds(
      tenantIds,
      startDateIso,
      endDateIso,
    ) as Set<string>;

    const before = transactions.length;
    transactions = transactions.filter((tx) => !internalLinks.has(tx.id));
    eliminatedIntercompanyCount = before - transactions.length;
  }

  const accounts = await storage.getAccountsForTenantScope(tenantIds) as ReportingAccountRow[];
  const options: ConsolidatedReportOptions = {
    includeDescendants: params.includeDescendants,
    includeIntercompany: params.includeIntercompany,
    strictReadiness: params.strictReadiness,
    stateFilter: params.stateFilter,
    entityTypes: params.entityTypes,
    federalTaxRate: params.federalTaxRate,
    defaultStateTaxRate: params.defaultStateTaxRate,
    stateTaxRates: params.stateTaxRates,
  };

  const report = buildConsolidatedReport({
    startDate: params.startDate,
    endDate: params.endDate,
    tenantIds,
    transactions,
    accounts,
    options,
    internalIntercompanyEliminated: eliminatedIntercompanyCount,
  });

  const preflight = buildPreflightChecks(report, params.strictReadiness);
  const remediationPrompts = buildRemediationPrompts(preflight.checks);

  return {
    report,
    preflight,
    remediationPrompts,
    verificationChecklist: preflight.checks.map((item) => ({
      id: item.id,
      status: item.status,
      message: item.message,
    })),
  };
}

// GET /api/reports/consolidated — multi-entity, multi-state report with verification checks
reportRoutes.get('/api/reports/consolidated', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');

  try {
    const startDate = normalizeDateInput(c.req.query('startDate'));
    const endDate = normalizeDateInput(c.req.query('endDate'));
    const includeDescendants = parseBool(c.req.query('includeDescendants'), true);
    const includeIntercompany = parseBool(c.req.query('includeIntercompany'), false);
    const strictReadiness = parseBool(c.req.query('strictReadiness'), false);
    const stateFilter = parseCsv(c.req.query('states'));
    const entityTypes = parseCsv(c.req.query('entityTypes'));

    const payload = await buildReportForRequest(storage, tenantId, {
      startDate,
      endDate,
      includeDescendants,
      includeIntercompany,
      strictReadiness,
      stateFilter,
      entityTypes,
      federalTaxRate: parseRate(c.req.query('federalTaxRate')),
      defaultStateTaxRate: parseRate(c.req.query('defaultStateTaxRate')),
      stateTaxRates: parseStateTaxRates(c.req.query('stateTaxRates')),
    });

    return c.json(payload);
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : 'Failed to generate consolidated report',
    }, 400);
  }
});

// POST /api/workflows/close-tax-automation — end-to-end automated close + tax readiness workflow
reportRoutes.post('/api/workflows/close-tax-automation', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const body = await c.req.json();

  try {
    const startDate = normalizeDateInput(body.startDate);
    const endDate = normalizeDateInput(body.endDate);
    const includeDescendants = parseBool(body.includeDescendants, true);
    const includeIntercompany = parseBool(body.includeIntercompany, false);
    const strictReadiness = parseBool(body.strictReadiness, true);
    const stateFilter = Array.isArray(body.states) ? body.states.map(String) : parseCsv(body.states);
    const entityTypes = Array.isArray(body.entityTypes) ? body.entityTypes.map(String) : parseCsv(body.entityTypes);

    const payload = await buildReportForRequest(storage, tenantId, {
      startDate,
      endDate,
      includeDescendants,
      includeIntercompany,
      strictReadiness,
      stateFilter,
      entityTypes,
      federalTaxRate: parseRate(body.federalTaxRate),
      defaultStateTaxRate: parseRate(body.defaultStateTaxRate),
      stateTaxRates: body.stateTaxRates ? parseStateTaxRates(JSON.stringify(body.stateTaxRates)) : undefined,
    });

    const runAiReview = parseBool(body.runAiReview, true);
    const aiReview = runAiReview
      ? await generateAiReview(c.env, {
          report: payload.report,
          checks: payload.preflight,
          prompts: payload.remediationPrompts,
        })
      : null;

    ledgerLog(c, {
      entityType: 'audit',
      action: 'workflow.close-tax-automation',
      metadata: {
        tenantId,
        startDate,
        endDate,
        readyToFileTaxes: payload.preflight.readyToFileTaxes,
        warnings: payload.preflight.checks.filter((x) => x.status === 'warn').length,
        failures: payload.preflight.checks.filter((x) => x.status === 'fail').length,
      },
    }, c.env);

    const runId = `close-${Date.now()}`;

    scopeLog(c, {
      externalId: runId,
      tenantId,
      scopeType: 'close_tax_automation',
      title: payload.preflight.readyToFileTaxes ? 'Tax close ready for filing' : 'Tax close remediation required',
      localStatus: payload.preflight.readyToFileTaxes ? 'completed' : 'in_progress',
      statusReason: payload.preflight.readyToFileTaxes ? 'All preflight checks passed' : 'Preflight issues require remediation',
      metadata: {
        startDate,
        endDate,
        readyToFileTaxes: payload.preflight.readyToFileTaxes,
        nextStep: payload.preflight.readyToFileTaxes ? 'prepare_tax_package' : 'resolve_preflight_issues',
        warningCount: payload.preflight.checks.filter((x) => x.status === 'warn').length,
        failureCount: payload.preflight.checks.filter((x) => x.status === 'fail').length,
      },
    }, c.env);

    return c.json({
      runId,
      generatedAt: new Date().toISOString(),
      ...payload,
      aiReview,
      nextStep: payload.preflight.readyToFileTaxes ? 'prepare_tax_package' : 'resolve_preflight_issues',
    });
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : 'Failed to run close-tax automation workflow',
    }, 400);
  }
});
