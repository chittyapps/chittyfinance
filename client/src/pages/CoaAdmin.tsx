import { useMemo, useState } from 'react';
import {
  useChartOfAccounts,
  useCreateCoaAccount,
  useUpdateCoaAccount,
  type ChartOfAccount,
} from '@/hooks/use-classification';
import { useTenantId } from '@/contexts/TenantContext';

type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';
type ScopeFilter = 'all' | 'global' | 'tenant';
type TypeFilter = AccountType | 'all';

/**
 * COA code-range convention used by the ChittyFinance seed data.
 * New accounts should fit one of these ranges based on their type.
 */
const CODE_RANGES: Record<AccountType, { min: number; max: number; label: string }[]> = {
  asset: [
    { min: 1000, max: 1099, label: 'Cash & Bank' },
    { min: 1100, max: 1199, label: 'Receivables' },
    { min: 1500, max: 1599, label: 'Real Property' },
    { min: 1600, max: 1699, label: 'Equipment & Furnishings' },
  ],
  liability: [
    { min: 2000, max: 2099, label: 'Current' },
    { min: 2500, max: 2599, label: 'Long-Term' },
  ],
  equity: [{ min: 3000, max: 3099, label: 'Equity' }],
  income: [
    { min: 4000, max: 4099, label: 'Rental Income' },
    { min: 4100, max: 4199, label: 'Other Income' },
  ],
  expense: [
    { min: 5000, max: 5499, label: 'Property Operating' },
    { min: 5100, max: 5199, label: 'Utilities' },
    { min: 5200, max: 5299, label: 'HOA & Association' },
    { min: 5300, max: 5399, label: 'Financial' },
    { min: 5400, max: 5499, label: 'Depreciation' },
    { min: 6000, max: 6099, label: 'Administrative' },
    { min: 7000, max: 7099, label: 'Capital Improvements' },
    { min: 9000, max: 9999, label: 'Suspense / Non-Deductible' },
  ],
};

/**
 * Validate a proposed new account code for a given type against existing COA entries.
 *
 * Rules:
 *   1. Code must be 4 digits
 *   2. Code must fall inside one of the ranges defined for `type`
 *   3. Code must not already exist for this tenant or as a global default
 *      (the DB permits tenant overrides of globals, but we warn to prevent
 *      accidental shadowing; the caller can ignore the warning)
 *   4. If parentCode is provided, it must exist in the COA
 *
 * Returns `{ valid: true }` or `{ valid: false, reason: string }`.
 */
function validateNewAccountCode(
  code: string,
  type: AccountType,
  parentCode: string | null,
  existing: ChartOfAccount[],
): { valid: true } | { valid: false; reason: string } {
  if (!/^\d{4}$/.test(code)) {
    return { valid: false, reason: 'Code must be exactly 4 digits' };
  }
  const num = parseInt(code, 10);
  const ranges = CODE_RANGES[type];
  const inRange = ranges.some((r) => num >= r.min && num <= r.max);
  if (!inRange) {
    const rangeLabels = ranges.map((r) => `${r.min}-${r.max} (${r.label})`).join(', ');
    return { valid: false, reason: `Code ${code} is outside the ${type} ranges: ${rangeLabels}` };
  }
  const duplicate = existing.find((a) => a.code === code);
  if (duplicate) {
    const scope = duplicate.tenantId ? 'this tenant' : 'global defaults';
    return { valid: false, reason: `Code ${code} already exists in ${scope} (${duplicate.name})` };
  }
  if (parentCode && !existing.some((a) => a.code === parentCode)) {
    return { valid: false, reason: `Parent code ${parentCode} does not exist` };
  }
  return { valid: true };
}

function typeColor(type: AccountType): string {
  switch (type) {
    case 'asset':
      return 'text-blue-400';
    case 'liability':
      return 'text-orange-400';
    case 'equity':
      return 'text-purple-400';
    case 'income':
      return 'text-green-400';
    case 'expense':
      return 'text-red-400';
  }
}

export default function CoaAdmin() {
  const tenantId = useTenantId();
  const { data: coa = [], isLoading } = useChartOfAccounts();
  const createAccount = useCreateCoaAccount();
  const updateAccount = useUpdateCoaAccount();

  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<ChartOfAccount | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  // Create form state
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<AccountType>('expense');
  const [formSubtype, setFormSubtype] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formScheduleE, setFormScheduleE] = useState('');
  const [formTaxDeductible, setFormTaxDeductible] = useState(false);
  const [formParentCode, setFormParentCode] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const lower = search.toLowerCase();
    return coa
      .filter((a) => {
        if (scopeFilter === 'global' && a.tenantId !== null) return false;
        if (scopeFilter === 'tenant' && a.tenantId === null) return false;
        if (typeFilter !== 'all' && a.type !== typeFilter) return false;
        if (lower && !a.code.includes(lower) && !a.name.toLowerCase().includes(lower)) return false;
        return true;
      })
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [coa, search, scopeFilter, typeFilter]);

  const stats = useMemo(() => {
    const global = coa.filter((a) => a.tenantId === null).length;
    const tenant = coa.filter((a) => a.tenantId !== null).length;
    return { total: coa.length, global, tenant };
  }, [coa]);

  function resetForm() {
    setFormCode('');
    setFormName('');
    setFormType('expense');
    setFormSubtype('');
    setFormDescription('');
    setFormScheduleE('');
    setFormTaxDeductible(false);
    setFormParentCode('');
    setFormError(null);
  }

  function handleCreate() {
    setFormError(null);
    const validation = validateNewAccountCode(formCode, formType, formParentCode || null, coa);
    if (!validation.valid) {
      setFormError(validation.reason);
      return;
    }
    if (!formName.trim()) {
      setFormError('Name is required');
      return;
    }

    createAccount.mutate(
      {
        code: formCode,
        name: formName.trim(),
        type: formType,
        subtype: formSubtype || null,
        description: formDescription || null,
        scheduleELine: formScheduleE || null,
        taxDeductible: formTaxDeductible,
        parentCode: formParentCode || null,
      },
      {
        onSuccess: (account) => {
          setLastResult(`Created ${account.code} — ${account.name}`);
          setShowCreate(false);
          resetForm();
        },
        onError: (err: any) => {
          const msg = err?.message || 'Create failed';
          if (msg.includes('403') || msg.toLowerCase().includes('forbidden')) {
            setFormError('You need owner or admin role on this tenant to modify the Chart of Accounts');
          } else {
            setFormError(msg);
          }
        },
      },
    );
  }

  function handleToggleActive(account: ChartOfAccount) {
    // Only tenant-owned accounts can be deactivated; global defaults are read-only
    if (!account.tenantId) {
      setLastResult('Global default accounts cannot be modified');
      return;
    }
    updateAccount.mutate(
      { id: account.id, isActive: !account.isActive },
      {
        onSuccess: (updated) => {
          setLastResult(`${updated.isActive ? 'Activated' : 'Deactivated'} ${updated.code} — ${updated.name}`);
        },
        onError: (err: any) => {
          setLastResult(`Error: ${err?.message || 'Update failed'}`);
        },
      },
    );
  }

  if (!tenantId) {
    return <div className="p-6 text-[hsl(var(--cf-text-muted))]">Select a tenant to manage Chart of Accounts.</div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-semibold text-[hsl(var(--cf-text))]">
            Chart of Accounts
          </h1>
          <p className="text-sm text-[hsl(var(--cf-text-muted))] mt-1">
            {stats.total} accounts ({stats.global} global defaults, {stats.tenant} tenant-specific) · L4 owner/admin required to edit
          </p>
        </div>
        <button
          onClick={() => {
            setShowCreate(!showCreate);
            if (!showCreate) resetForm();
          }}
          className="px-4 py-2 text-sm font-medium bg-[hsl(var(--cf-lime))] text-black rounded-md hover:bg-[hsl(var(--cf-lime-bright))] transition-colors"
        >
          {showCreate ? 'Cancel' : 'New Account'}
        </button>
      </div>

      {lastResult && (
        <div className="px-4 py-2 text-sm bg-[hsl(var(--cf-raised))] border border-[hsl(var(--cf-border))] rounded-md text-[hsl(var(--cf-text-muted))]">
          {lastResult}
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="bg-[hsl(var(--cf-raised))] border border-[hsl(var(--cf-border))] rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-[hsl(var(--cf-text))]">Create Tenant-Specific Account</h2>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Code">
              <input
                type="text"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                placeholder="e.g. 5075"
                maxLength={10}
                className="w-full px-3 py-2 text-sm bg-[hsl(var(--cf-surface))] border border-[hsl(var(--cf-border))] rounded-md text-[hsl(var(--cf-text))] font-mono"
              />
            </FormField>

            <FormField label="Type">
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value as AccountType)}
                className="w-full px-3 py-2 text-sm bg-[hsl(var(--cf-surface))] border border-[hsl(var(--cf-border))] rounded-md text-[hsl(var(--cf-text))]"
              >
                <option value="asset">Asset</option>
                <option value="liability">Liability</option>
                <option value="equity">Equity</option>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
            </FormField>

            <FormField label="Name" wide>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Repairs — Plumbing"
                className="w-full px-3 py-2 text-sm bg-[hsl(var(--cf-surface))] border border-[hsl(var(--cf-border))] rounded-md text-[hsl(var(--cf-text))]"
              />
            </FormField>

            <FormField label="Subtype">
              <input
                type="text"
                value={formSubtype}
                onChange={(e) => setFormSubtype(e.target.value)}
                placeholder="optional"
                className="w-full px-3 py-2 text-sm bg-[hsl(var(--cf-surface))] border border-[hsl(var(--cf-border))] rounded-md text-[hsl(var(--cf-text))]"
              />
            </FormField>

            <FormField label="Parent Code">
              <input
                type="text"
                value={formParentCode}
                onChange={(e) => setFormParentCode(e.target.value)}
                placeholder="e.g. 5070"
                className="w-full px-3 py-2 text-sm bg-[hsl(var(--cf-surface))] border border-[hsl(var(--cf-border))] rounded-md text-[hsl(var(--cf-text))] font-mono"
              />
            </FormField>

            <FormField label="Schedule E Line">
              <input
                type="text"
                value={formScheduleE}
                onChange={(e) => setFormScheduleE(e.target.value)}
                placeholder="e.g. Line 14"
                className="w-full px-3 py-2 text-sm bg-[hsl(var(--cf-surface))] border border-[hsl(var(--cf-border))] rounded-md text-[hsl(var(--cf-text))]"
              />
            </FormField>

            <label className="flex items-center gap-2 text-sm text-[hsl(var(--cf-text))]">
              <input
                type="checkbox"
                checked={formTaxDeductible}
                onChange={(e) => setFormTaxDeductible(e.target.checked)}
              />
              Tax deductible
            </label>

            <FormField label="Description" wide>
              <textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="optional — shown in reports and AI suggestions"
                rows={2}
                className="w-full px-3 py-2 text-sm bg-[hsl(var(--cf-surface))] border border-[hsl(var(--cf-border))] rounded-md text-[hsl(var(--cf-text))]"
              />
            </FormField>
          </div>

          {formError && (
            <div className="px-3 py-2 text-sm bg-red-900/20 border border-red-700 rounded-md text-red-300">
              {formError}
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={handleCreate}
              disabled={createAccount.isPending}
              className="px-4 py-2 text-sm font-medium bg-[hsl(var(--cf-lime))] text-black rounded-md hover:bg-[hsl(var(--cf-lime-bright))] transition-colors disabled:opacity-50"
            >
              {createAccount.isPending ? 'Creating...' : 'Create Account'}
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search code or name..."
          className="flex-1 min-w-[200px] px-3 py-2 text-sm bg-[hsl(var(--cf-surface))] border border-[hsl(var(--cf-border))] rounded-md text-[hsl(var(--cf-text))] placeholder:text-[hsl(var(--cf-text-muted))]"
        />
        <select
          value={scopeFilter}
          onChange={(e) => setScopeFilter(e.target.value as ScopeFilter)}
          className="px-3 py-2 text-sm bg-[hsl(var(--cf-surface))] border border-[hsl(var(--cf-border))] rounded-md text-[hsl(var(--cf-text))]"
        >
          <option value="all">All scopes</option>
          <option value="global">Global only</option>
          <option value="tenant">Tenant only</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
          className="px-3 py-2 text-sm bg-[hsl(var(--cf-surface))] border border-[hsl(var(--cf-border))] rounded-md text-[hsl(var(--cf-text))]"
        >
          <option value="all">All types</option>
          <option value="asset">Asset</option>
          <option value="liability">Liability</option>
          <option value="equity">Equity</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-12 text-[hsl(var(--cf-text-muted))]">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-[hsl(var(--cf-text-muted))]">No accounts match the current filters.</div>
      ) : (
        <div className="bg-[hsl(var(--cf-raised))] border border-[hsl(var(--cf-border))] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-[hsl(var(--cf-text-muted))] border-b border-[hsl(var(--cf-border))]">
                <th className="px-4 py-3 text-left">Code</th>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Schedule E</th>
                <th className="px-4 py-3 text-left">Scope</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr
                  key={a.id}
                  className={`border-b border-[hsl(var(--cf-border))] last:border-0 ${a.isActive ? '' : 'opacity-50'}`}
                >
                  <td className="px-4 py-3 font-mono text-[hsl(var(--cf-text))]">{a.code}</td>
                  <td className="px-4 py-3 text-[hsl(var(--cf-text))]">
                    {a.name}
                    {a.subtype && <span className="ml-2 text-xs text-[hsl(var(--cf-text-muted))]">({a.subtype})</span>}
                  </td>
                  <td className={`px-4 py-3 ${typeColor(a.type)}`}>{a.type}</td>
                  <td className="px-4 py-3 text-[hsl(var(--cf-text-muted))]">{a.scheduleELine ?? '—'}</td>
                  <td className="px-4 py-3">
                    {a.tenantId === null ? (
                      <span className="text-xs px-2 py-0.5 bg-blue-900/30 text-blue-300 rounded">Global</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 bg-[hsl(var(--cf-lime)/0.2)] text-[hsl(var(--cf-lime))] rounded">Tenant</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {a.tenantId !== null && (
                      <button
                        onClick={() => handleToggleActive(a)}
                        className="text-xs px-2 py-1 bg-[hsl(var(--cf-surface))] border border-[hsl(var(--cf-border))] rounded hover:bg-[hsl(var(--cf-raised))] transition-colors"
                      >
                        {a.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FormField({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <label className="text-xs text-[hsl(var(--cf-text-muted))] mb-1 block">{label}</label>
      {children}
    </div>
  );
}
