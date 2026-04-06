import { useState } from 'react';
import { useTenant } from '@/contexts/TenantContext';
import {
  useAllocationRules,
  useCreateAllocationRule,
  useDeleteAllocationRule,
  usePreviewAllocations,
  useExecuteAllocations,
  useAllocationRuns,
  type AllocationPreview,
} from '@/hooks/use-allocations';

const RULE_TYPES = [
  { value: 'management_fee', label: 'Management Fee', desc: '% of income → management entity' },
  { value: 'cost_sharing', label: 'Cost Sharing', desc: 'Split expenses across entities' },
  { value: 'rent_passthrough', label: 'Rent Pass-Through', desc: 'Pass income up to parent' },
  { value: 'custom_pct', label: 'Custom %', desc: 'Arbitrary % of all transactions' },
];

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function Allocations() {
  const { tenants } = useTenant();
  const { data: rulesData, isLoading: rulesLoading } = useAllocationRules();
  const { data: runsData } = useAllocationRuns();
  const createRule = useCreateAllocationRule();
  const deleteRule = useDeleteAllocationRule();
  const previewMutation = usePreviewAllocations();
  const executeMutation = useExecuteAllocations();

  const [showCreate, setShowCreate] = useState(false);
  const [preview, setPreview] = useState<AllocationPreview | null>(null);
  const [periodStart, setPeriodStart] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [periodEnd, setPeriodEnd] = useState(() => {
    const d = new Date();
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return last.toISOString().slice(0, 10);
  });

  // Create form state
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('management_fee');
  const [formSource, setFormSource] = useState('');
  const [formTarget, setFormTarget] = useState('');
  const [formPct, setFormPct] = useState('10');
  const [formFreq, setFormFreq] = useState('monthly');
  const [formCategory, setFormCategory] = useState('');

  const rules = rulesData?.rules || [];
  const runs = runsData?.runs || [];
  const tenantMap = new Map(tenants.map((t) => [t.id, t.name]));

  function handleCreate() {
    createRule.mutate(
      {
        name: formName,
        ruleType: formType,
        sourceTenantId: formSource,
        targetTenantId: formTarget,
        percentage: formPct || null,
        allocationMethod: 'percentage',
        frequency: formFreq,
        sourceCategory: formCategory || null,
      } as any,
      {
        onSuccess: () => {
          setShowCreate(false);
          setFormName('');
          setFormPct('10');
          setFormCategory('');
        },
      },
    );
  }

  function handlePreview() {
    previewMutation.mutate(
      { periodStart, periodEnd },
      { onSuccess: (data) => setPreview(data) },
    );
  }

  function handleExecute() {
    executeMutation.mutate(
      { periodStart, periodEnd },
      { onSuccess: () => setPreview(null) },
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-semibold text-[hsl(var(--cf-text))]">
            Inter-Company Allocations
          </h1>
          <p className="text-sm text-[hsl(var(--cf-text-muted))] mt-1">
            Automate management fees, cost sharing, and rent pass-through between entities
          </p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 text-sm font-medium bg-[hsl(var(--cf-lime))] text-black rounded-md hover:bg-[hsl(var(--cf-lime-bright))] transition-colors"
        >
          {showCreate ? 'Cancel' : 'New Rule'}
        </button>
      </div>

      {/* Create Rule Form */}
      {showCreate && (
        <div className="bg-[hsl(var(--cf-raised))] border border-[hsl(var(--cf-border))] rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-[hsl(var(--cf-text))]">Create Allocation Rule</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-[hsl(var(--cf-text-muted))] mb-1 block">Rule Name</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. MGMT 10% Fee"
                className="w-full px-3 py-2 text-sm bg-[hsl(var(--cf-surface))] border border-[hsl(var(--cf-border))] rounded-md text-[hsl(var(--cf-text))] placeholder:text-[hsl(var(--cf-text-muted))]"
              />
            </div>

            <div>
              <label className="text-xs text-[hsl(var(--cf-text-muted))] mb-1 block">Rule Type</label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-[hsl(var(--cf-surface))] border border-[hsl(var(--cf-border))] rounded-md text-[hsl(var(--cf-text))]"
              >
                {RULE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-[hsl(var(--cf-text-muted))] mb-1 block">Source Entity</label>
              <select
                value={formSource}
                onChange={(e) => setFormSource(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-[hsl(var(--cf-surface))] border border-[hsl(var(--cf-border))] rounded-md text-[hsl(var(--cf-text))]"
              >
                <option value="">Select entity...</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-[hsl(var(--cf-text-muted))] mb-1 block">Target Entity</label>
              <select
                value={formTarget}
                onChange={(e) => setFormTarget(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-[hsl(var(--cf-surface))] border border-[hsl(var(--cf-border))] rounded-md text-[hsl(var(--cf-text))]"
              >
                <option value="">Select entity...</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-[hsl(var(--cf-text-muted))] mb-1 block">Percentage</label>
              <input
                type="number"
                value={formPct}
                onChange={(e) => setFormPct(e.target.value)}
                min="0"
                max="100"
                step="0.01"
                className="w-full px-3 py-2 text-sm bg-[hsl(var(--cf-surface))] border border-[hsl(var(--cf-border))] rounded-md text-[hsl(var(--cf-text))]"
              />
            </div>

            <div>
              <label className="text-xs text-[hsl(var(--cf-text-muted))] mb-1 block">Frequency</label>
              <select
                value={formFreq}
                onChange={(e) => setFormFreq(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-[hsl(var(--cf-surface))] border border-[hsl(var(--cf-border))] rounded-md text-[hsl(var(--cf-text))]"
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annually">Annually</option>
              </select>
            </div>

            <div className="col-span-2">
              <label className="text-xs text-[hsl(var(--cf-text-muted))] mb-1 block">
                Category Filter <span className="opacity-50">(optional — leave blank for all)</span>
              </label>
              <input
                type="text"
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                placeholder="e.g. rent, utilities"
                className="w-full px-3 py-2 text-sm bg-[hsl(var(--cf-surface))] border border-[hsl(var(--cf-border))] rounded-md text-[hsl(var(--cf-text))] placeholder:text-[hsl(var(--cf-text-muted))]"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleCreate}
              disabled={!formName || !formSource || !formTarget || createRule.isPending}
              className="px-4 py-2 text-sm font-medium bg-[hsl(var(--cf-lime))] text-black rounded-md hover:bg-[hsl(var(--cf-lime-bright))] transition-colors disabled:opacity-40"
            >
              {createRule.isPending ? 'Creating...' : 'Create Rule'}
            </button>
          </div>
        </div>
      )}

      {/* Rules List */}
      <div className="bg-[hsl(var(--cf-raised))] border border-[hsl(var(--cf-border))] rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-[hsl(var(--cf-border-subtle))]">
          <h2 className="text-sm font-semibold text-[hsl(var(--cf-text))]">Active Rules</h2>
        </div>

        {rulesLoading ? (
          <div className="p-8 text-center text-sm text-[hsl(var(--cf-text-muted))]">Loading...</div>
        ) : rules.length === 0 ? (
          <div className="p-8 text-center text-sm text-[hsl(var(--cf-text-muted))]">
            No allocation rules configured. Create one to automate inter-company transfers.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[hsl(var(--cf-text-muted))] border-b border-[hsl(var(--cf-border-subtle))]">
                <th className="px-5 py-2 font-medium">Name</th>
                <th className="px-5 py-2 font-medium">Type</th>
                <th className="px-5 py-2 font-medium">Source</th>
                <th className="px-5 py-2 font-medium">Target</th>
                <th className="px-5 py-2 font-medium text-right">Rate</th>
                <th className="px-5 py-2 font-medium">Freq</th>
                <th className="px-5 py-2 font-medium">Last Run</th>
                <th className="px-5 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-b border-[hsl(var(--cf-border-subtle))] last:border-0 hover:bg-[hsl(var(--cf-overlay))]">
                  <td className="px-5 py-3 font-medium text-[hsl(var(--cf-text))]">{rule.name}</td>
                  <td className="px-5 py-3">
                    <span className="text-xs px-2 py-0.5 rounded bg-[hsl(var(--cf-surface))] text-[hsl(var(--cf-text-secondary))]">
                      {RULE_TYPES.find((t) => t.value === rule.ruleType)?.label || rule.ruleType}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-[hsl(var(--cf-text-secondary))]">
                    {tenantMap.get(rule.sourceTenantId) || rule.sourceTenantId.slice(0, 8)}
                  </td>
                  <td className="px-5 py-3 text-[hsl(var(--cf-text-secondary))]">
                    {tenantMap.get(rule.targetTenantId) || rule.targetTenantId.slice(0, 8)}
                  </td>
                  <td className="px-5 py-3 text-right text-[hsl(var(--cf-text))]">
                    {rule.percentage ? `${rule.percentage}%` : rule.fixedAmount ? `$${rule.fixedAmount}` : '-'}
                  </td>
                  <td className="px-5 py-3 text-[hsl(var(--cf-text-muted))] capitalize">{rule.frequency}</td>
                  <td className="px-5 py-3 text-[hsl(var(--cf-text-muted))]">
                    {rule.lastRunAt ? formatDate(rule.lastRunAt) : 'Never'}
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => deleteRule.mutate(rule.id)}
                      className="text-xs text-red-400 hover:text-red-300 transition-colors"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Preview & Execute */}
      <div className="bg-[hsl(var(--cf-raised))] border border-[hsl(var(--cf-border))] rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold text-[hsl(var(--cf-text))]">Run Allocations</h2>

        <div className="flex items-end gap-4">
          <div>
            <label className="text-xs text-[hsl(var(--cf-text-muted))] mb-1 block">Period Start</label>
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="px-3 py-2 text-sm bg-[hsl(var(--cf-surface))] border border-[hsl(var(--cf-border))] rounded-md text-[hsl(var(--cf-text))]"
            />
          </div>
          <div>
            <label className="text-xs text-[hsl(var(--cf-text-muted))] mb-1 block">Period End</label>
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="px-3 py-2 text-sm bg-[hsl(var(--cf-surface))] border border-[hsl(var(--cf-border))] rounded-md text-[hsl(var(--cf-text))]"
            />
          </div>
          <button
            onClick={handlePreview}
            disabled={previewMutation.isPending || rules.length === 0}
            className="px-4 py-2 text-sm font-medium bg-[hsl(var(--cf-surface))] text-[hsl(var(--cf-text))] border border-[hsl(var(--cf-border))] rounded-md hover:bg-[hsl(var(--cf-overlay))] transition-colors disabled:opacity-40"
          >
            {previewMutation.isPending ? 'Calculating...' : 'Preview'}
          </button>
          {preview && preview.results.length > 0 && (
            <button
              onClick={handleExecute}
              disabled={executeMutation.isPending}
              className="px-4 py-2 text-sm font-medium bg-[hsl(var(--cf-lime))] text-black rounded-md hover:bg-[hsl(var(--cf-lime-bright))] transition-colors disabled:opacity-40"
            >
              {executeMutation.isPending ? 'Executing...' : `Execute (${formatCurrency(preview.totalAllocated)})`}
            </button>
          )}
        </div>

        {executeMutation.isSuccess && (
          <div className="text-sm text-emerald-400 bg-emerald-400/10 px-4 py-2 rounded-md">
            Allocations executed successfully. Inter-company transactions created.
          </div>
        )}

        {/* Preview Results */}
        {preview && (
          <div className="mt-4">
            {preview.results.length === 0 ? (
              <p className="text-sm text-[hsl(var(--cf-text-muted))]">
                No allocations to process for this period.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[hsl(var(--cf-text-muted))] border-b border-[hsl(var(--cf-border-subtle))]">
                    <th className="py-2 font-medium">Rule</th>
                    <th className="py-2 font-medium">Type</th>
                    <th className="py-2 font-medium text-right">Source Amount</th>
                    <th className="py-2 font-medium text-right">Allocated</th>
                    <th className="py-2 font-medium text-right">Txns</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.results.map((r, i) => (
                    <tr key={i} className="border-b border-[hsl(var(--cf-border-subtle))] last:border-0">
                      <td className="py-2 text-[hsl(var(--cf-text))]">{r.ruleName}</td>
                      <td className="py-2">
                        <span className="text-xs px-2 py-0.5 rounded bg-[hsl(var(--cf-surface))] text-[hsl(var(--cf-text-secondary))]">
                          {r.ruleType.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-2 text-right text-[hsl(var(--cf-text-secondary))]">{formatCurrency(r.sourceAmount)}</td>
                      <td className="py-2 text-right font-medium text-[hsl(var(--cf-lime))]">{formatCurrency(r.allocatedAmount)}</td>
                      <td className="py-2 text-right text-[hsl(var(--cf-text-muted))]">{r.matchedTransactionCount}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-[hsl(var(--cf-border))]">
                    <td colSpan={3} className="py-2 text-right font-medium text-[hsl(var(--cf-text))]">Total</td>
                    <td className="py-2 text-right font-bold text-[hsl(var(--cf-lime-bright))]">{formatCurrency(preview.totalAllocated)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Recent Runs */}
      {runs.length > 0 && (
        <div className="bg-[hsl(var(--cf-raised))] border border-[hsl(var(--cf-border))] rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-[hsl(var(--cf-border-subtle))]">
            <h2 className="text-sm font-semibold text-[hsl(var(--cf-text))]">Recent Runs</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[hsl(var(--cf-text-muted))] border-b border-[hsl(var(--cf-border-subtle))]">
                <th className="px-5 py-2 font-medium">Period</th>
                <th className="px-5 py-2 font-medium text-right">Source</th>
                <th className="px-5 py-2 font-medium text-right">Allocated</th>
                <th className="px-5 py-2 font-medium">Status</th>
                <th className="px-5 py-2 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {runs.slice(0, 20).map((run) => (
                <tr key={run.id} className="border-b border-[hsl(var(--cf-border-subtle))] last:border-0">
                  <td className="px-5 py-2 text-[hsl(var(--cf-text-secondary))]">
                    {formatDate(run.periodStart)} - {formatDate(run.periodEnd)}
                  </td>
                  <td className="px-5 py-2 text-right text-[hsl(var(--cf-text-secondary))]">
                    {formatCurrency(parseFloat(run.sourceAmount))}
                  </td>
                  <td className="px-5 py-2 text-right font-medium text-[hsl(var(--cf-text))]">
                    {formatCurrency(parseFloat(run.allocatedAmount))}
                  </td>
                  <td className="px-5 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      run.status === 'posted' ? 'bg-emerald-400/10 text-emerald-400'
                        : run.status === 'approved' ? 'bg-blue-400/10 text-blue-400'
                        : run.status === 'reversed' ? 'bg-red-400/10 text-red-400'
                        : 'bg-amber-400/10 text-amber-400'
                    }`}>
                      {run.status}
                    </span>
                  </td>
                  <td className="px-5 py-2 text-[hsl(var(--cf-text-muted))]">{formatDate(run.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
