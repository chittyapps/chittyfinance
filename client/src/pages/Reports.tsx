import { Fragment, useState, useCallback } from 'react';
import ScheduleEWorkspaceControls from '@/components/reports/ScheduleEWorkspaceControls';
import { useTenantId } from '@/contexts/TenantContext';
import {
  useConsolidatedReport, useRunTaxAutomation,
  useScheduleEReport, useForm1065Report, useExportTaxPackage,
  type ReportParams, type TaxReportParams,
  type ScheduleEPropertyColumn, type ScheduleELineItem,
  type ScheduleELineSummaryItem, type ClassificationQuality,
  type Form1065Report as Form1065ReportType, type K1MemberAllocation,
} from '@/hooks/use-reports';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  BarChart3, Download, Play, CheckCircle2, AlertTriangle, XCircle,
  TrendingUp, TrendingDown, Building2, MapPin, Shield, FileText, Users
} from 'lucide-react';

function pct(value: number, total: number) {
  if (total === 0) return '0%';
  return `${((value / total) * 100).toFixed(1)}%`;
}

const currentYear = new Date().getFullYear();
const defaultStart = `${currentYear}-01-01`;
const defaultEnd = `${currentYear}-12-31`;

const STATUS_ICON = {
  pass: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />,
  warn: <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />,
  fail: <XCircle className="w-3.5 h-3.5 text-rose-400" />,
};

type ReportTab = 'consolidated' | 'schedule-e' | 'form-1065';

const TAB_CONFIG: Array<{ key: ReportTab; label: string; icon: typeof BarChart3 }> = [
  { key: 'consolidated', label: 'Consolidated', icon: BarChart3 },
  { key: 'schedule-e', label: 'Schedule E', icon: FileText },
  { key: 'form-1065', label: 'Form 1065 / K-1', icon: Users },
];

function ClassificationQualityBanner({ quality }: { quality: ClassificationQuality }) {
  if (quality.totalTransactions === 0) return null;
  const ready = quality.readyToFile;
  const borderClass = ready ? 'border-l-emerald-400' : 'border-l-rose-400';
  const iconClass = ready ? 'text-emerald-400' : 'text-rose-400';
  const textClass = ready ? 'text-emerald-400' : 'text-rose-400';

  return (
    <div className={`cf-card p-3 border-l-2 ${borderClass}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {ready ? (
            <CheckCircle2 className={`w-3.5 h-3.5 ${iconClass}`} />
          ) : (
            <AlertTriangle className={`w-3.5 h-3.5 ${iconClass}`} />
          )}
          <span className={`text-xs font-medium ${textClass}`}>
            {ready ? 'Ready to file' : 'Not ready to file'} — {quality.confirmedPct}% of transactions are human-confirmed (L2)
          </span>
        </div>
        <span className="text-[10px] text-[hsl(var(--cf-text-muted))] font-mono">
          {quality.l2ClassifiedCount} confirmed · {quality.l1SuggestedOnlyCount} L1 suggested · {quality.unclassifiedCount} unclassified
        </span>
      </div>
      {quality.l1SuggestedOnlyCount > 0 && (
        <p className="text-[10px] text-[hsl(var(--cf-text-muted))] mt-1">
          {formatCurrency(quality.l1SuggestedOnlyAmount)} of suggested-only transactions haven't been reviewed. Visit Classification to confirm them before filing.
        </p>
      )}
    </div>
  );
}

function LineSummarySection({ summary }: { summary: ScheduleELineSummaryItem[] }) {
  const [expandedLine, setExpandedLine] = useState<string | null>(null);
  if (summary.length === 0) return null;

  const totalIncome = summary
    .filter((s) => s.lineNumber === 'Line 3')
    .reduce((sum, s) => sum + s.amount, 0);
  const totalExpenses = summary
    .filter((s) => s.lineNumber !== 'Line 3')
    .reduce((sum, s) => sum + s.amount, 0);
  const net = totalIncome - totalExpenses;

  return (
    <div className="cf-card overflow-hidden">
      <div className="px-4 py-3 border-b border-[hsl(var(--cf-border-subtle))] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-3.5 h-3.5 text-[hsl(var(--cf-text-muted))]" />
          <div>
            <h4 className="text-sm font-medium text-[hsl(var(--cf-text))]">Schedule E Line Summary</h4>
            <p className="text-[10px] text-[hsl(var(--cf-text-muted))]">Aggregated across all properties — what you file on the form</p>
          </div>
        </div>
        <span className={`text-sm font-mono font-bold ${net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
          Net: {formatCurrency(net)}
        </span>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[hsl(var(--cf-border-subtle))] text-[hsl(var(--cf-text-muted))]">
            <th className="text-left px-3 py-2 font-medium w-24">Line</th>
            <th className="text-left px-3 py-2 font-medium">Description</th>
            <th className="text-right px-3 py-2 font-medium w-28">Amount</th>
            <th className="text-right px-3 py-2 font-medium w-16">Txns</th>
            <th className="text-right px-3 py-2 font-medium w-24">Breakdown</th>
          </tr>
        </thead>
        <tbody>
          {summary.map((line) => {
            const isExpanded = expandedLine === line.lineNumber;
            const isIncome = line.lineNumber === 'Line 3';
            const hasMultipleCoa = line.coaBreakdown.length > 1;
            return (
              <Fragment key={line.lineNumber}>
                <tr
                  className="border-b border-[hsl(var(--cf-border-subtle))] hover:bg-[hsl(var(--cf-raised))]"
                >
                  <td className="px-3 py-2 text-[hsl(var(--cf-text-muted))] font-mono">{line.lineNumber}</td>
                  <td className="px-3 py-2 text-[hsl(var(--cf-text))]">{line.lineLabel}</td>
                  <td className={`px-3 py-2 text-right font-mono font-medium ${isIncome ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {formatCurrency(line.amount)}
                  </td>
                  <td className="px-3 py-2 text-right text-[hsl(var(--cf-text-muted))]">{line.transactionCount}</td>
                  <td className="px-3 py-2 text-right">
                    {hasMultipleCoa ? (
                      <button
                        onClick={() => setExpandedLine(isExpanded ? null : line.lineNumber)}
                        className="text-[10px] text-[hsl(var(--cf-lime))] hover:underline"
                      >
                        {isExpanded ? 'Hide' : `${line.coaBreakdown.length} codes`}
                      </button>
                    ) : (
                      <span className="text-[10px] text-[hsl(var(--cf-text-muted))] font-mono">{line.coaBreakdown[0]?.coaCode}</span>
                    )}
                  </td>
                </tr>
                {isExpanded &&
                  line.coaBreakdown.map((entry) => (
                    <tr key={`${line.lineNumber}-${entry.coaCode}`} className="bg-[hsl(var(--cf-raised))]">
                      <td />
                      <td className="px-3 py-1.5 text-[10px] text-[hsl(var(--cf-text-muted))] pl-6">
                        <span className="font-mono">{entry.coaCode}</span> — {entry.coaName}
                      </td>
                      <td className={`px-3 py-1.5 text-right font-mono text-[10px] ${isIncome ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatCurrency(entry.amount)}
                      </td>
                      <td className="px-3 py-1.5 text-right text-[10px] text-[hsl(var(--cf-text-muted))]">
                        {entry.transactionCount}
                      </td>
                      <td />
                    </tr>
                  ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ScheduleETab({ workspace, onWorkspaceChange }: {
  workspace: { taxYear: number; selectedPropertyIds: Set<string>; selectedTenantIds: Set<string> };
  onWorkspaceChange: (ws: { taxYear: number; selectedPropertyIds: Set<string>; selectedTenantIds: Set<string> }) => void;
}) {
  // Discovery query — all data, cached, populates filter options
  const discoveryParams: TaxReportParams = { taxYear: workspace.taxYear, includeDescendants: true };
  const { data: discoveryData, error: discoveryError } = useScheduleEReport(discoveryParams);

  // Filtered query — only when filters active
  const hasPropertyFilter = workspace.selectedPropertyIds.size > 0;
  const hasEntityFilter = workspace.selectedTenantIds.size > 0;
  const hasAnyFilter = hasPropertyFilter || hasEntityFilter;

  const filteredParams: TaxReportParams | null = hasAnyFilter ? {
    taxYear: workspace.taxYear,
    includeDescendants: true,
    propertyIds: hasPropertyFilter ? [...workspace.selectedPropertyIds] : undefined,
    tenantIds: hasEntityFilter ? [...workspace.selectedTenantIds] : undefined,
  } : null;
  const { data: filteredData, isLoading: filteredLoading, error: filteredError } = useScheduleEReport(filteredParams);

  // Use filtered result when filters active, otherwise discovery result
  const data = hasAnyFilter ? filteredData : discoveryData;
  const isLoading = hasAnyFilter ? filteredLoading : !discoveryData;

  // Derive workspace options from discovery data
  const availableProperties = (discoveryData?.properties ?? []).map((p) => ({
    propertyId: p.propertyId,
    propertyName: p.propertyName,
    address: p.address,
    tenantName: p.tenantName,
  }));
  const availableEntities = Array.from(
    new Map((discoveryData?.properties ?? []).map((p) => [p.tenantId, { tenantId: p.tenantId, tenantName: p.tenantName, tenantType: 'property' }])).values(),
  );

  const netIncome = data ? data.properties.reduce((sum, p) => sum + p.netIncome, 0) + data.entityLevelTotal : null;

  const error = hasAnyFilter ? filteredError : discoveryError;
  if (error) return <div className="cf-card p-4 text-sm text-rose-400">Failed to load Schedule E report.</div>;
  if (!discoveryData && isLoading) return <div className="cf-card p-8 text-center text-sm text-[hsl(var(--cf-text-muted))]">Loading Schedule E...</div>;

  return (
    <div className="space-y-4">
      {/* Workspace controls */}
      <ScheduleEWorkspaceControls
        state={workspace}
        onChange={onWorkspaceChange}
        availableProperties={availableProperties}
        availableEntities={availableEntities}
        netIncome={netIncome}
        isLoading={isLoading && hasAnyFilter}
      />

      {!data ? (
        <div className="cf-card p-8 text-center text-sm text-[hsl(var(--cf-text-muted))]">Loading filtered report...</div>
      ) : (
        <>
      {/* Classification quality banner */}
      <ClassificationQualityBanner quality={data.classificationQuality} />

      {/* Warnings */}
      {data.uncategorizedCount > 0 && (
        <div className="cf-card p-3 border-l-2 border-l-amber-400">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs text-amber-400">{data.uncategorizedCount} transactions ({formatCurrency(data.uncategorizedAmount)}) unmapped to Schedule E lines</span>
          </div>
          {data.unmappedCategories.length > 0 && (
            <p className="text-[10px] text-[hsl(var(--cf-text-muted))] mt-1">Categories: {data.unmappedCategories.join(', ')}</p>
          )}
        </div>
      )}

      {/* Aggregated Line Summary — this is what goes on the IRS form */}
      <LineSummarySection summary={data.lineSummary} />

      {/* Per-property cards */}
      {data.properties.map((prop: ScheduleEPropertyColumn) => (
        <div key={prop.propertyId} className="cf-card overflow-hidden">
          <div className="px-4 py-3 border-b border-[hsl(var(--cf-border-subtle))] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5 text-[hsl(var(--cf-text-muted))]" />
              <div>
                <h4 className="text-sm font-medium text-[hsl(var(--cf-text))]">{prop.propertyName}</h4>
                <p className="text-[10px] text-[hsl(var(--cf-text-muted))]">{prop.address} | {prop.state}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="text-[10px]">{prop.filingType === 'schedule-e-personal' ? 'Personal (Sched E)' : 'Partnership (1065)'}</Badge>
              <span className={`text-sm font-mono font-bold ${prop.netIncome >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {formatCurrency(prop.netIncome)}
              </span>
            </div>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[hsl(var(--cf-border-subtle))] text-[hsl(var(--cf-text-muted))]">
                <th className="text-left px-3 py-2 font-medium w-24">Line</th>
                <th className="text-left px-3 py-2 font-medium">Description</th>
                <th className="text-right px-3 py-2 font-medium w-28">Amount</th>
                <th className="text-right px-3 py-2 font-medium w-16">Txns</th>
              </tr>
            </thead>
            <tbody>
              {prop.lines.map((line: ScheduleELineItem) => (
                <tr key={line.lineNumber} className="border-b border-[hsl(var(--cf-border-subtle))] hover:bg-[hsl(var(--cf-raised))]">
                  <td className="px-3 py-1.5 text-[hsl(var(--cf-text-muted))] font-mono">{line.lineNumber}</td>
                  <td className="px-3 py-1.5 text-[hsl(var(--cf-text))]">{line.lineLabel}</td>
                  <td className={`px-3 py-1.5 text-right font-mono ${line.lineNumber === 'Line 3' ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {formatCurrency(line.amount)}
                  </td>
                  <td className="px-3 py-1.5 text-right text-[hsl(var(--cf-text-muted))]">{line.transactionCount}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-[hsl(var(--cf-raised))]">
                <td colSpan={2} className="px-3 py-2 text-[hsl(var(--cf-text))] font-medium">Net Income</td>
                <td className={`px-3 py-2 text-right font-mono font-bold ${prop.netIncome >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {formatCurrency(prop.netIncome)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      ))}

      {/* Entity-level items */}
      {data.entityLevelItems.length > 0 && (
        <div className="cf-card overflow-hidden">
          <div className="px-4 py-3 border-b border-[hsl(var(--cf-border-subtle))]">
            <h4 className="text-sm font-medium text-[hsl(var(--cf-text))]">Entity-Level Items</h4>
            <p className="text-[10px] text-[hsl(var(--cf-text-muted))]">Not attributed to a specific property</p>
          </div>
          <table className="w-full text-xs">
            <tbody>
              {data.entityLevelItems.map((line: ScheduleELineItem) => (
                <tr key={line.lineNumber} className="border-b border-[hsl(var(--cf-border-subtle))]">
                  <td className="px-3 py-1.5 text-[hsl(var(--cf-text-muted))] font-mono w-24">{line.lineNumber}</td>
                  <td className="px-3 py-1.5 text-[hsl(var(--cf-text))]">{line.lineLabel}</td>
                  <td className="px-3 py-1.5 text-right font-mono w-28">{formatCurrency(line.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.properties.length === 0 && (
        <div className="cf-card p-8 text-center text-sm text-[hsl(var(--cf-text-muted))]">No property transactions found for {workspace.taxYear}.</div>
      )}
        </>
      )}
    </div>
  );
}

function Form1065Tab({ taxYear }: { taxYear: number }) {
  const params: TaxReportParams = { taxYear, includeDescendants: true };
  const { data: reports, isLoading, error } = useForm1065Report(params);

  if (isLoading) return <div className="cf-card p-8 text-center text-sm text-[hsl(var(--cf-text-muted))]">Loading Form 1065...</div>;
  if (error) return <div className="cf-card p-4 text-sm text-rose-400">Failed to load Form 1065 report.</div>;
  if (!reports || reports.length === 0) return <div className="cf-card p-8 text-center text-sm text-[hsl(var(--cf-text-muted))]">No partnership entities found for {taxYear}.</div>;

  return (
    <div className="space-y-4">
      {reports.map((report: Form1065ReportType) => (
        <div key={report.entityId} className="space-y-3">
          {/* Entity header */}
          <div className="cf-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-sm font-medium text-[hsl(var(--cf-text))]">{report.entityName}</h4>
                <p className="text-[10px] text-[hsl(var(--cf-text-muted))]">Form 1065 — {report.entityType} — Tax Year {report.taxYear}</p>
              </div>
              <span className={`text-lg font-mono font-bold ${report.netIncome >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {formatCurrency(report.netIncome)}
              </span>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-[hsl(var(--cf-raised))] rounded p-3">
                <p className="text-[10px] text-[hsl(var(--cf-text-muted))] uppercase tracking-wider">Gross Income</p>
                <p className="text-sm font-mono font-bold text-emerald-400">{formatCurrency(report.ordinaryIncome)}</p>
              </div>
              <div className="bg-[hsl(var(--cf-raised))] rounded p-3">
                <p className="text-[10px] text-[hsl(var(--cf-text-muted))] uppercase tracking-wider">Deductions</p>
                <p className="text-sm font-mono font-bold text-rose-400">{formatCurrency(report.totalDeductions)}</p>
              </div>
              <div className="bg-[hsl(var(--cf-raised))] rounded p-3">
                <p className="text-[10px] text-[hsl(var(--cf-text-muted))] uppercase tracking-wider">Net Income</p>
                <p className={`text-sm font-mono font-bold ${report.netIncome >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(report.netIncome)}</p>
              </div>
            </div>

            {/* Warnings */}
            {report.warnings.length > 0 && (
              <div className="mt-3 space-y-1">
                {report.warnings.map((w: string, i: number) => (
                  <div key={i} className="flex items-center gap-2">
                    <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                    <span className="text-[10px] text-amber-400">{w}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Income breakdown */}
          {report.incomeByCategory.length > 0 && (
            <div className="cf-card overflow-hidden">
              <div className="px-4 py-2 border-b border-[hsl(var(--cf-border-subtle))]">
                <h5 className="text-xs font-medium text-[hsl(var(--cf-text))]">Income</h5>
              </div>
              <table className="w-full text-xs">
                <tbody>
                  {report.incomeByCategory.map((item: { category: string; coaCode: string; amount: number }, i: number) => (
                    <tr key={i} className="border-b border-[hsl(var(--cf-border-subtle))]">
                      <td className="px-3 py-1.5 text-[hsl(var(--cf-text))]">{item.category}</td>
                      <td className="px-3 py-1.5 text-[hsl(var(--cf-text-muted))] font-mono w-16">{item.coaCode}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-emerald-400 w-28">{formatCurrency(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Deductions breakdown */}
          {report.deductionsByCategory.length > 0 && (
            <div className="cf-card overflow-hidden">
              <div className="px-4 py-2 border-b border-[hsl(var(--cf-border-subtle))]">
                <h5 className="text-xs font-medium text-[hsl(var(--cf-text))]">Deductions</h5>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[hsl(var(--cf-border-subtle))] text-[hsl(var(--cf-text-muted))]">
                    <th className="text-left px-3 py-1.5 font-medium">Category</th>
                    <th className="text-left px-3 py-1.5 font-medium w-16">Code</th>
                    <th className="text-left px-3 py-1.5 font-medium w-20">Sched E</th>
                    <th className="text-right px-3 py-1.5 font-medium w-28">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {report.deductionsByCategory.map((item: { category: string; coaCode: string; scheduleELine?: string; amount: number }, i: number) => (
                    <tr key={i} className="border-b border-[hsl(var(--cf-border-subtle))]">
                      <td className="px-3 py-1.5 text-[hsl(var(--cf-text))]">{item.category}</td>
                      <td className="px-3 py-1.5 text-[hsl(var(--cf-text-muted))] font-mono">{item.coaCode}</td>
                      <td className="px-3 py-1.5 text-[hsl(var(--cf-text-muted))] font-mono text-[10px]">{item.scheduleELine || '—'}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-rose-400">{formatCurrency(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* K-1 Member Allocations */}
          {report.memberAllocations.length > 0 && (
            <div className="cf-card overflow-hidden">
              <div className="px-4 py-3 border-b border-[hsl(var(--cf-border-subtle))] flex items-center gap-2">
                <Users className="w-3.5 h-3.5 text-[hsl(var(--cf-text-muted))]" />
                <h5 className="text-xs font-medium text-[hsl(var(--cf-text))]">K-1 Member Allocations</h5>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[hsl(var(--cf-border-subtle))] text-[hsl(var(--cf-text-muted))]">
                    <th className="text-left px-3 py-2 font-medium">Member</th>
                    <th className="text-right px-3 py-2 font-medium w-20">Eff. %</th>
                    <th className="text-right px-3 py-2 font-medium w-28">Allocated</th>
                    <th className="text-left px-3 py-2 font-medium">Periods</th>
                  </tr>
                </thead>
                <tbody>
                  {report.memberAllocations.map((m: K1MemberAllocation, i: number) => (
                    <tr key={i} className="border-b border-[hsl(var(--cf-border-subtle))] hover:bg-[hsl(var(--cf-raised))]">
                      <td className="px-3 py-2 text-[hsl(var(--cf-text))] font-medium">{m.memberName}</td>
                      <td className="px-3 py-2 text-right font-mono">{m.pct.toFixed(1)}%</td>
                      <td className={`px-3 py-2 text-right font-mono font-medium ${m.totalAllocated >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatCurrency(m.totalAllocated)}
                      </td>
                      <td className="px-3 py-2 text-[10px] text-[hsl(var(--cf-text-muted))]">
                        {m.periods.length > 0
                          ? m.periods.map(p => `${p.startDate}–${p.endDate} (${p.pct}%)`).join('; ')
                          : 'Full year'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function Reports() {
  const tenantId = useTenantId();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<ReportTab>('consolidated');
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [includeDescendants, setIncludeDescendants] = useState(true);
  const [includeIntercompany, setIncludeIntercompany] = useState(false);
  const [taxYear, setTaxYear] = useState(currentYear);
  const [workspace, setWorkspace] = useState({
    taxYear: currentYear,
    selectedPropertyIds: new Set<string>(),
    selectedTenantIds: new Set<string>(),
  });
  const handleWorkspaceChange = useCallback((ws: typeof workspace) => {
    setWorkspace(ws);
    setTaxYear(ws.taxYear);
  }, []);

  const params: ReportParams | null = tenantId ? { startDate, endDate, includeDescendants, includeIntercompany } : null;
  const { data, isLoading, error } = useConsolidatedReport(activeTab === 'consolidated' ? params : null);
  const taxAutomation = useRunTaxAutomation();
  const exportTaxPkg = useExportTaxPackage();

  if (!tenantId) {
    return <div className="p-6 text-[hsl(var(--cf-text-muted))]">Select a tenant to view reports.</div>;
  }

  const report = data?.report;
  const preflight = data?.preflight;
  const checks = data?.verificationChecklist || [];
  const remediationPrompts = data?.remediationPrompts || [];

  const handleRunTax = () => {
    taxAutomation.mutate({ startDate, endDate, includeDescendants, includeIntercompany }, {
      onSuccess: (result) => {
        toast({ title: result.nextStep === 'prepare_tax_package' ? 'Tax automation complete - Ready to file!' : 'Issues found - resolve before filing' });
      },
      onError: () => toast({ title: 'Tax automation failed', variant: 'destructive' }),
    });
  };

  const exportCsv = () => {
    if (!report) return;
    const rows = [
      'Consolidated P&L Report',
      `Period: ${report.scope.startDate} to ${report.scope.endDate}`,
      '',
      'TOTALS',
      `Income,${report.totals.income}`,
      `Expenses,${report.totals.expenses}`,
      `Deductible Expenses,${report.totals.deductibleExpenses}`,
      `Net Income,${report.totals.net}`,
      '',
      'BY ENTITY',
      'Entity,Type,Income,Expenses,Net',
      ...report.byEntity.map(e => `"${e.tenantName}",${e.tenantType},${e.income},${e.expenses},${e.net}`),
      '',
      'BY STATE',
      'State,Income,Expenses,Taxable Income,Estimated Tax',
      ...report.byState.map(s => `${s.state},${s.income},${s.expenses},${s.taxableIncome},${s.estimatedTax}`),
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `report-${startDate}-${endDate}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportTaxPackage = (format: 'csv' | 'json') => {
    const hasPropertyFilter = workspace.selectedPropertyIds.size > 0;
    const hasEntityFilter = workspace.selectedTenantIds.size > 0;
    exportTaxPkg.mutate({
      taxYear,
      format,
      propertyIds: hasPropertyFilter ? [...workspace.selectedPropertyIds] : undefined,
      tenantIds: hasEntityFilter ? [...workspace.selectedTenantIds] : undefined,
    }, {
      onSuccess: () => toast({ title: `Tax package exported (${format.toUpperCase()})` }),
      onError: () => toast({ title: 'Export failed', variant: 'destructive' }),
    });
  };

  return (
    <div className="p-6 space-y-4 animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-semibold text-[hsl(var(--cf-text))]">Reports</h1>
          <p className="text-xs text-[hsl(var(--cf-text-muted))]">Consolidated financial reporting & tax readiness</p>
        </div>
        <div className="flex gap-2">
          {activeTab === 'consolidated' ? (
            <>
              <Button variant="outline" size="sm" onClick={exportCsv} disabled={!report} className="gap-1.5">
                <Download className="w-3.5 h-3.5" /> Export
              </Button>
              <Button size="sm" onClick={handleRunTax} disabled={taxAutomation.isPending} className="gap-1.5 bg-lime-500 hover:bg-lime-600 text-black">
                <Play className="w-3.5 h-3.5" /> {taxAutomation.isPending ? 'Running...' : 'Run Tax Automation'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => handleExportTaxPackage('csv')} disabled={exportTaxPkg.isPending} className="gap-1.5">
                <Download className="w-3.5 h-3.5" /> CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleExportTaxPackage('json')} disabled={exportTaxPkg.isPending} className="gap-1.5">
                <Download className="w-3.5 h-3.5" /> JSON
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-1 p-1 bg-[hsl(var(--cf-raised))] rounded-lg w-fit">
        {TAB_CONFIG.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-[hsl(var(--cf-surface))] text-[hsl(var(--cf-text))] shadow-sm'
                : 'text-[hsl(var(--cf-text-muted))] hover:text-[hsl(var(--cf-text))]'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Controls — consolidated tab */}
      {activeTab === 'consolidated' && (
        <div className="cf-card p-4 flex flex-wrap gap-4 items-end">
          <div>
            <Label className="text-xs text-[hsl(var(--cf-text-muted))]">Start Date</Label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-[150px] h-8 text-xs" />
          </div>
          <div>
            <Label className="text-xs text-[hsl(var(--cf-text-muted))]">End Date</Label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-[150px] h-8 text-xs" />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={includeDescendants} onCheckedChange={setIncludeDescendants} />
            <Label className="text-xs">Include subsidiaries</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={includeIntercompany} onCheckedChange={setIncludeIntercompany} />
            <Label className="text-xs">Include intercompany</Label>
          </div>
        </div>
      )}

      {/* Controls — Form 1065 tab only (Schedule E has its own workspace controls) */}
      {activeTab === 'form-1065' && (
        <div className="cf-card p-4 flex gap-4 items-end">
          <div>
            <Label className="text-xs text-[hsl(var(--cf-text-muted))]">Tax Year</Label>
            <select
              value={taxYear}
              onChange={e => setTaxYear(Number(e.target.value))}
              className="block w-[120px] h-8 text-xs rounded border border-[hsl(var(--cf-border-subtle))] bg-[hsl(var(--cf-surface))] text-[hsl(var(--cf-text))] px-2"
            >
              {Array.from({ length: 5 }, (_, i) => currentYear - 3 + i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Schedule E Tab */}
      {activeTab === 'schedule-e' && <ScheduleETab workspace={workspace} onWorkspaceChange={handleWorkspaceChange} />}

      {/* Form 1065 / K-1 Tab */}
      {activeTab === 'form-1065' && <Form1065Tab taxYear={taxYear} />}

      {/* Consolidated Tab */}
      {activeTab === 'consolidated' && isLoading && <div className="cf-card p-8 text-center text-sm text-[hsl(var(--cf-text-muted))]">Generating report...</div>}
      {activeTab === 'consolidated' && error && <div className="cf-card p-4 text-sm text-rose-400">Failed to load report. Check date range.</div>}

      {activeTab === 'consolidated' && report && (
        <>
          {/* P&L Summary */}
          <div className="grid grid-cols-4 gap-3">
            <div className="cf-card px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <p className="text-[10px] text-[hsl(var(--cf-text-muted))] uppercase tracking-wider">Income</p>
              </div>
              <p className="text-lg font-mono font-bold text-emerald-400">{formatCurrency(report.totals.income)}</p>
            </div>
            <div className="cf-card px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
                <p className="text-[10px] text-[hsl(var(--cf-text-muted))] uppercase tracking-wider">Expenses</p>
              </div>
              <p className="text-lg font-mono font-bold text-rose-400">{formatCurrency(report.totals.expenses)}</p>
              <p className="text-[10px] text-[hsl(var(--cf-text-muted))]">Deductible: {formatCurrency(report.totals.deductibleExpenses)}</p>
            </div>
            <div className="cf-card px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="w-3.5 h-3.5 text-[hsl(var(--cf-lime))]" />
                <p className="text-[10px] text-[hsl(var(--cf-text-muted))] uppercase tracking-wider">Net Income</p>
              </div>
              <p className={`text-lg font-mono font-bold ${report.totals.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {formatCurrency(report.totals.net)}
              </p>
            </div>
            <div className="cf-card px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <Shield className="w-3.5 h-3.5 text-violet-400" />
                <p className="text-[10px] text-[hsl(var(--cf-text-muted))] uppercase tracking-wider">Net Worth</p>
              </div>
              <p className="text-lg font-mono font-bold text-violet-400">{formatCurrency(report.balances.netWorth)}</p>
              <p className="text-[10px] text-[hsl(var(--cf-text-muted))]">{report.totals.transactionCount} transactions</p>
            </div>
          </div>

          {/* Quality Metrics */}
          <div className="cf-card p-4">
            <h3 className="text-sm font-medium text-[hsl(var(--cf-text))] mb-3">Data Quality</h3>
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Uncategorized', value: report.quality.uncategorizedCount, color: report.quality.uncategorizedCount === 0 ? 'text-emerald-400' : 'text-amber-400' },
                { label: 'Unreconciled', value: report.quality.unreconciledCount, color: report.quality.unreconciledCount === 0 ? 'text-emerald-400' : 'text-amber-400' },
                { label: 'No State', value: report.quality.unassignedStateCount, color: report.quality.unassignedStateCount === 0 ? 'text-emerald-400' : 'text-amber-400' },
                { label: 'Future-Dated', value: report.quality.futureDatedCount, color: report.quality.futureDatedCount === 0 ? 'text-emerald-400' : 'text-rose-400' },
              ].map(m => (
                <div key={m.label} className="flex items-center gap-2">
                  <span className={`text-lg font-mono font-bold ${m.color}`}>{m.value}</span>
                  <span className="text-xs text-[hsl(var(--cf-text-muted))]">{m.label}</span>
                  <span className="text-[10px] text-[hsl(var(--cf-text-muted))]">({pct(m.value, report.quality.totalTransactions)})</span>
                </div>
              ))}
            </div>
          </div>

          {/* By Entity */}
          {report.byEntity.length > 0 && (
            <div className="cf-card overflow-hidden">
              <div className="px-4 py-3 border-b border-[hsl(var(--cf-border-subtle))] flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5 text-[hsl(var(--cf-text-muted))]" />
                <h3 className="text-sm font-medium text-[hsl(var(--cf-text))]">By Entity</h3>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[hsl(var(--cf-border-subtle))] text-[hsl(var(--cf-text-muted))]">
                    <th className="text-left px-3 py-2 font-medium">Entity</th>
                    <th className="text-left px-3 py-2 font-medium">Type</th>
                    <th className="text-right px-3 py-2 font-medium">Income</th>
                    <th className="text-right px-3 py-2 font-medium">Expenses</th>
                    <th className="text-right px-3 py-2 font-medium">Net</th>
                    <th className="text-right px-3 py-2 font-medium">Txns</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byEntity.map(e => (
                    <tr key={e.tenantId} className="border-b border-[hsl(var(--cf-border-subtle))] hover:bg-[hsl(var(--cf-raised))]">
                      <td className="px-3 py-2 text-[hsl(var(--cf-text))] font-medium">{e.tenantName}</td>
                      <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">{e.tenantType}</Badge></td>
                      <td className="px-3 py-2 text-right font-mono text-emerald-400">{formatCurrency(e.income)}</td>
                      <td className="px-3 py-2 text-right font-mono text-rose-400">{formatCurrency(e.expenses)}</td>
                      <td className={`px-3 py-2 text-right font-mono font-medium ${e.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(e.net)}</td>
                      <td className="px-3 py-2 text-right text-[hsl(var(--cf-text-muted))]">{e.transactionCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* By State */}
          {report.byState.length > 0 && (
            <div className="cf-card overflow-hidden">
              <div className="px-4 py-3 border-b border-[hsl(var(--cf-border-subtle))] flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-[hsl(var(--cf-text-muted))]" />
                <h3 className="text-sm font-medium text-[hsl(var(--cf-text))]">By State</h3>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[hsl(var(--cf-border-subtle))] text-[hsl(var(--cf-text-muted))]">
                    <th className="text-left px-3 py-2 font-medium">State</th>
                    <th className="text-right px-3 py-2 font-medium">Income</th>
                    <th className="text-right px-3 py-2 font-medium">Expenses</th>
                    <th className="text-right px-3 py-2 font-medium">Taxable Income</th>
                    <th className="text-right px-3 py-2 font-medium">Est. Tax</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byState.map(s => (
                    <tr key={s.state} className="border-b border-[hsl(var(--cf-border-subtle))] hover:bg-[hsl(var(--cf-raised))]">
                      <td className="px-3 py-2 text-[hsl(var(--cf-text))] font-medium">{s.state}</td>
                      <td className="px-3 py-2 text-right font-mono text-emerald-400">{formatCurrency(s.income)}</td>
                      <td className="px-3 py-2 text-right font-mono text-rose-400">{formatCurrency(s.expenses)}</td>
                      <td className="px-3 py-2 text-right font-mono text-[hsl(var(--cf-text))]">{formatCurrency(s.taxableIncome)}</td>
                      <td className="px-3 py-2 text-right font-mono text-amber-400">{formatCurrency(s.estimatedTax)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Tax Readiness Checklist */}
          {preflight && (
            <div className="cf-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-[hsl(var(--cf-text))]">Tax Readiness</h3>
                <Badge className={preflight.readyToFileTaxes ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}>
                  {preflight.readyToFileTaxes ? 'Ready to File' : 'Not Ready'}
                </Badge>
              </div>
              <div className="space-y-1.5">
                {checks.map(c => (
                  <div key={c.id} className="flex items-center gap-2 py-1">
                    {STATUS_ICON[c.status]}
                    <span className="text-xs text-[hsl(var(--cf-text-secondary))]">{c.message}</span>
                  </div>
                ))}
              </div>
              {remediationPrompts.length > 0 && (
                <div className="mt-3 pt-3 border-t border-[hsl(var(--cf-border-subtle))]">
                  <p className="text-[10px] text-[hsl(var(--cf-text-muted))] uppercase tracking-wider mb-1.5">Remediation Steps</p>
                  {remediationPrompts.map((prompt, i) => (
                    <p key={i} className="text-xs text-[hsl(var(--cf-text-secondary))] py-0.5">{i + 1}. {prompt}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tax Automation Result */}
          {taxAutomation.data && (
            <div className="cf-card p-4 border-l-2 border-l-lime-400">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-[hsl(var(--cf-text))]">Tax Automation Result</h3>
                <span className="text-[10px] text-[hsl(var(--cf-text-muted))]">{taxAutomation.data.generatedAt}</span>
              </div>
              {taxAutomation.data.aiReview && (
                <div className="text-xs text-[hsl(var(--cf-text-secondary))] whitespace-pre-wrap bg-[hsl(var(--cf-raised))] rounded p-3">
                  {taxAutomation.data.aiReview.content}
                </div>
              )}
              <p className="text-xs text-[hsl(var(--cf-text-muted))] mt-2">Next: {taxAutomation.data.nextStep.replace(/_/g, ' ')}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
