import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTenantId } from '@/contexts/TenantContext';
import { usePortfolioSummary } from './use-property';
import { useConsolidatedReport } from './use-reports';

export type ActionSeverity = 'critical' | 'warning' | 'info';
export type ActionType =
  | 'overdue_rent'
  | 'expiring_lease'
  | 'unreconciled'
  | 'uncategorized'
  | 'integration_down'
  | 'quality_issue'
  | 'vacant_unit'
  | 'future_dated'
  | 'close_blocker';

export interface ActionItem {
  id: string;
  type: ActionType;
  severity: ActionSeverity;
  title: string;
  detail: string;
  count?: number;
  actionLabel: string;
  actionHref: string;
}

interface IntegrationStatus {
  configured: boolean;
  label?: string;
}

const SEVERITY_ORDER: Record<ActionSeverity, number> = { critical: 0, warning: 1, info: 2 };

export function useActionQueue() {
  const tenantId = useTenantId();

  const { data: portfolio } = usePortfolioSummary();

  const { data: integrationStatus } = useQuery<Record<string, IntegrationStatus>>({
    queryKey: ['/api/integrations/status'],
    staleTime: 60_000,
  });

  const now = new Date();
  const { data: reportData } = useConsolidatedReport(
    tenantId
      ? {
          startDate: `${now.getFullYear()}-01-01`,
          endDate: `${now.getFullYear()}-12-31`,
          includeDescendants: true,
          includeIntercompany: false,
        }
      : null,
  );

  const items = useMemo(() => {
    const queue: ActionItem[] = [];

    // Use server-computed quality metrics from consolidated report
    // instead of fetching all transactions client-side
    if (reportData?.report?.quality) {
      const q = reportData.report.quality;

      if (q.unreconciledCount > 0) {
        queue.push({
          id: 'unreconciled-txns',
          type: 'unreconciled',
          severity: q.unreconciledCount > 50 ? 'critical' : q.unreconciledCount > 10 ? 'warning' : 'info',
          title: `${q.unreconciledCount} unreconciled transaction${q.unreconciledCount !== 1 ? 's' : ''}`,
          detail: `${q.totalTransactions} total — not yet matched to bank records`,
          count: q.unreconciledCount,
          actionLabel: 'Reconcile',
          actionHref: '/transactions',
        });
      }

      if (q.uncategorizedCount > 0) {
        queue.push({
          id: 'uncategorized-txns',
          type: 'uncategorized',
          severity: q.uncategorizedCount > 20 ? 'warning' : 'info',
          title: `${q.uncategorizedCount} uncategorized transaction${q.uncategorizedCount !== 1 ? 's' : ''}`,
          detail: 'Category assignment needed for accurate reporting',
          count: q.uncategorizedCount,
          actionLabel: 'Categorize',
          actionHref: '/transactions',
        });
      }

      if (q.unassignedStateCount > 0) {
        queue.push({
          id: 'unassigned-state',
          type: 'quality_issue',
          severity: 'warning',
          title: `${q.unassignedStateCount} transactions missing state`,
          detail: 'State assignment needed for multi-state tax reporting',
          count: q.unassignedStateCount,
          actionLabel: 'Fix',
          actionHref: '/reports',
        });
      }

      if (q.futureDatedCount > 0) {
        queue.push({
          id: 'future-dated',
          type: 'future_dated',
          severity: 'warning',
          title: `${q.futureDatedCount} future-dated transaction${q.futureDatedCount !== 1 ? 's' : ''}`,
          detail: 'Transactions dated after today — verify or correct',
          count: q.futureDatedCount,
          actionLabel: 'Review',
          actionHref: '/transactions',
        });
      }
    }

    // Integration health — flag unconfigured services
    if (integrationStatus) {
      const services = [
        { key: 'mercury', name: 'Mercury Bank', priority: 'critical' as ActionSeverity },
        { key: 'wave', name: 'Wave Accounting', priority: 'warning' as ActionSeverity },
        { key: 'stripe', name: 'Stripe', priority: 'warning' as ActionSeverity },
        { key: 'openai', name: 'OpenAI', priority: 'info' as ActionSeverity },
      ];
      for (const svc of services) {
        const status = integrationStatus[svc.key];
        if (status && !status.configured) {
          queue.push({
            id: `integration-${svc.key}`,
            type: 'integration_down',
            severity: svc.priority,
            title: `${svc.name} not configured`,
            detail: 'Environment variables missing — data sync inactive',
            actionLabel: 'Configure',
            actionHref: '/connections',
          });
        }
      }
    }

    // Portfolio vacancy
    if (portfolio && portfolio.totalUnits > 0) {
      const vacantUnits = portfolio.totalUnits - portfolio.occupiedUnits;
      if (vacantUnits > 0) {
        queue.push({
          id: 'vacant-units',
          type: 'vacant_unit',
          severity: portfolio.occupancyRate < 60 ? 'critical' : portfolio.occupancyRate < 80 ? 'warning' : 'info',
          title: `${vacantUnits} vacant unit${vacantUnits !== 1 ? 's' : ''}`,
          detail: `${portfolio.occupancyRate.toFixed(0)}% portfolio occupancy`,
          count: vacantUnits,
          actionLabel: 'View Properties',
          actionHref: '/',
        });
      }
    }

    // Close readiness blockers
    if (reportData?.preflight && !reportData.preflight.readyToFileTaxes) {
      const failCount = reportData.preflight.checks.filter((c) => c.status === 'fail').length;
      if (failCount > 0) {
        queue.push({
          id: 'close-blockers',
          type: 'close_blocker',
          severity: 'critical',
          title: `${failCount} close blocker${failCount !== 1 ? 's' : ''}`,
          detail: 'Tax readiness checks failing — remediation required',
          count: failCount,
          actionLabel: 'View Report',
          actionHref: '/reports',
        });
      }
    }

    queue.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
    return queue;
  }, [portfolio, integrationStatus, reportData]);

  return {
    items,
    criticalCount: items.filter((i) => i.severity === 'critical').length,
    warningCount: items.filter((i) => i.severity === 'warning').length,
    total: items.length,
  };
}
