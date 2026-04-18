import { useMemo, useState } from 'react';
import {
  useChartOfAccounts,
  useClassificationStats,
  useUnclassifiedTransactions,
  useReconciledTransactions,
  useClassifyTransaction,
  useReconcileTransaction,
  useUnreconcileTransaction,
  useAiSuggest,
  useBatchSuggest,
  useTenantSettings,
  useUpdateTenantSettings,
  useClassificationAudit,
  type UnclassifiedTransaction,
  type ChartOfAccount,
} from '@/hooks/use-classification';

type TabMode = 'queue' | 'reconciled';

type SortMode = 'date-desc' | 'amount-desc' | 'confidence-asc' | 'confidence-desc';

function formatCurrency(amount: string | number): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    signDisplay: 'auto',
  }).format(n);
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function confidenceColor(conf: number): string {
  if (conf >= 0.8) return 'text-green-400';
  if (conf >= 0.5) return 'text-yellow-400';
  return 'text-red-400';
}

function auditActionColor(action: string): string {
  if (action === 'reconcile') return 'text-yellow-400';
  if (action.includes('classify')) return 'text-green-400';
  return 'text-[hsl(var(--cf-text-muted))]';
}

/**
 * Trust boundary for one-click "Accept High-Confidence Suggestions".
 *
 * Rules (all must pass):
 *   1. Has a suggestion to accept (suggestedCoaCode is set)
 *   2. Not already authoritatively classified (coaCode is null)
 *   3. Confidence >= MIN_BULK_CONFIDENCE (0.80 — the AI "success" threshold)
 *   4. Not suggestion code 9010 (Suspense) — the whole point of 9010 is
 *      "needs a human"; bulk-accepting it defeats the purpose
 *   5. Absolute amount <= MAX_BULK_AMOUNT ($500) — large-dollar transactions
 *      carry more audit exposure and warrant explicit review regardless
 *      of AI confidence
 *
 * Reconciled rows are already filtered server-side by
 * getUnclassifiedTransactions, so we don't re-check here.
 */
const MIN_BULK_CONFIDENCE = 0.8;
const MAX_BULK_AMOUNT = 500;

function bulkAcceptCandidates(
  txns: UnclassifiedTransaction[],
  _coa: ChartOfAccount[],
): UnclassifiedTransaction[] {
  return txns.filter((tx) => {
    if (!tx.suggestedCoaCode || tx.coaCode) return false;
    if (tx.suggestedCoaCode === '9010') return false;
    const confidence = parseFloat(tx.classificationConfidence ?? '0');
    if (confidence < MIN_BULK_CONFIDENCE) return false;
    if (Math.abs(parseFloat(tx.amount)) > MAX_BULK_AMOUNT) return false;
    return true;
  });
}

function compareTransactions(a: UnclassifiedTransaction, b: UnclassifiedTransaction, mode: SortMode): number {
  switch (mode) {
    case 'date-desc':
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    case 'amount-desc':
      return Math.abs(parseFloat(b.amount)) - Math.abs(parseFloat(a.amount));
    case 'confidence-asc':
      return parseFloat(a.classificationConfidence ?? '0') - parseFloat(b.classificationConfidence ?? '0');
    case 'confidence-desc':
      return parseFloat(b.classificationConfidence ?? '0') - parseFloat(a.classificationConfidence ?? '0');
  }
}

export default function Classification() {
  const { data: stats } = useClassificationStats();
  const { data: txns = [], isLoading } = useUnclassifiedTransactions(100);
  const { data: reconciledTxns = [], isLoading: reconciledLoading } = useReconciledTransactions(100);
  const { data: coa = [] } = useChartOfAccounts();
  const classify = useClassifyTransaction();
  const reconcile = useReconcileTransaction();
  const unreconcile = useUnreconcileTransaction();
  const aiSuggest = useAiSuggest();
  const batchSuggest = useBatchSuggest();
  const { data: tenantSettings } = useTenantSettings();
  const updateSettings = useUpdateTenantSettings();

  const [activeTab, setActiveTab] = useState<TabMode>('queue');
  const [sortMode, setSortMode] = useState<SortMode>('date-desc');
  const [lastResult, setLastResult] = useState<string | null>(null);

  const bulkAcceptDisabled = tenantSettings?.bulkAcceptDisabled ?? false;

  const coaMap = useMemo(() => new Map(coa.map((a) => [a.code, a])), [coa]);
  const sortedTxns = useMemo(() => [...txns].sort((a, b) => compareTransactions(a, b, sortMode)), [txns, sortMode]);

  function handleClassify(txId: string, coaCode: string) {
    classify.mutate(
      { transactionId: txId, coaCode, reason: 'Manual classification via UI' },
      {
        onSuccess: () => setLastResult(`Classified transaction as ${coaCode}`),
        onError: (err: any) => setLastResult(`Classification failed: ${err.message}`),
      },
    );
  }

  function handleReconcile(txId: string) {
    reconcile.mutate(
      { transactionId: txId },
      {
        onSuccess: () => setLastResult('Transaction reconciled and locked'),
        onError: (err: any) => setLastResult(`Error: ${err.message}`),
      },
    );
  }

  function handleAiSuggest() {
    aiSuggest.mutate(25, {
      onSuccess: (data) =>
        setLastResult(
          `AI suggest: ${data.suggested} suggested (${data.aiCount} via GPT, ${data.keywordCount} via keyword)${
            data.aiAvailable ? '' : ' — OpenAI key not configured, keyword-only'
          }`,
        ),
    });
  }

  function handleBatchKeyword() {
    batchSuggest.mutate(100, {
      onSuccess: (data: any) => setLastResult(`Keyword batch: ${data.suggested}/${data.processed} suggested`),
    });
  }

  function handleAcceptAll() {
    const candidates = bulkAcceptCandidates(sortedTxns, coa);
    if (candidates.length === 0) {
      setLastResult('No candidates qualified for bulk accept');
      return;
    }
    let done = 0;
    let failed = 0;
    const total = candidates.length;
    for (const tx of candidates) {
      if (!tx.suggestedCoaCode) continue;
      classify.mutate(
        { transactionId: tx.id, coaCode: tx.suggestedCoaCode, reason: 'Bulk accept: high-confidence suggestion' },
        {
          onSuccess: () => {
            done++;
            if (done + failed === total) setLastResult(`Bulk: ${done} accepted${failed ? `, ${failed} failed` : ''}`);
          },
          onError: () => {
            failed++;
            if (done + failed === total) setLastResult(`Bulk: ${done} accepted, ${failed} failed`);
          },
        },
      );
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-semibold text-[hsl(var(--cf-text))]">
            Classification Queue
          </h1>
          <p className="text-sm text-[hsl(var(--cf-text-muted))] mt-1">
            Review and classify transactions using the Chart of Accounts
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleBatchKeyword}
            disabled={batchSuggest.isPending}
            className="px-3 py-2 text-sm font-medium bg-[hsl(var(--cf-raised))] border border-[hsl(var(--cf-border))] text-[hsl(var(--cf-text))] rounded-md hover:bg-[hsl(var(--cf-surface))] transition-colors disabled:opacity-50"
          >
            {batchSuggest.isPending ? 'Running...' : 'Keyword Suggest'}
          </button>
          <button
            onClick={handleAiSuggest}
            disabled={aiSuggest.isPending}
            className="px-3 py-2 text-sm font-medium bg-[hsl(var(--cf-lime))] text-black rounded-md hover:bg-[hsl(var(--cf-lime-bright))] transition-colors disabled:opacity-50"
          >
            {aiSuggest.isPending ? 'Thinking...' : 'AI Suggest (GPT)'}
          </button>
          {!bulkAcceptDisabled && (
            <button
              onClick={handleAcceptAll}
              disabled={classify.isPending}
              className="px-3 py-2 text-sm font-medium bg-[hsl(var(--cf-raised))] border border-[hsl(var(--cf-border))] text-[hsl(var(--cf-text))] rounded-md hover:bg-[hsl(var(--cf-surface))] transition-colors disabled:opacity-50"
            >
              Accept High-Confidence
            </button>
          )}
        </div>
      </div>

      {/* Last action result */}
      {lastResult && (
        <div className="px-4 py-2 text-sm bg-[hsl(var(--cf-raised))] border border-[hsl(var(--cf-border))] rounded-md text-[hsl(var(--cf-text-muted))]">
          {lastResult}
        </div>
      )}

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <StatCard label="Total" value={String(stats.total)} />
          <StatCard label="Classified" value={`${stats.classified} (${stats.classifiedPct}%)`} />
          <StatCard label="Reconciled" value={String(stats.reconciled)} />
          <StatCard label="Unclassified" value={String(stats.unclassified)} />
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-[hsl(var(--cf-raised))] rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('queue')}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            activeTab === 'queue'
              ? 'bg-[hsl(var(--cf-surface))] text-[hsl(var(--cf-text))] shadow-sm'
              : 'text-[hsl(var(--cf-text-muted))] hover:text-[hsl(var(--cf-text))]'
          }`}
        >
          Queue ({txns.length})
        </button>
        <button
          onClick={() => setActiveTab('reconciled')}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            activeTab === 'reconciled'
              ? 'bg-[hsl(var(--cf-surface))] text-[hsl(var(--cf-text))] shadow-sm'
              : 'text-[hsl(var(--cf-text-muted))] hover:text-[hsl(var(--cf-text))]'
          }`}
        >
          Reconciled ({reconciledTxns.length})
        </button>
      </div>

      {/* Queue tab */}
      {activeTab === 'queue' && (
        <>
          {/* Sort controls */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-[hsl(var(--cf-text-muted))]">Sort:</label>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="px-3 py-1.5 text-sm bg-[hsl(var(--cf-surface))] border border-[hsl(var(--cf-border))] rounded-md text-[hsl(var(--cf-text))]"
            >
              <option value="date-desc">Most recent</option>
              <option value="amount-desc">Largest amount</option>
              <option value="confidence-asc">Lowest confidence first</option>
              <option value="confidence-desc">Highest confidence first</option>
            </select>
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-[hsl(var(--cf-text-muted))]">Loading...</div>
          ) : sortedTxns.length === 0 ? (
            <div className="text-center py-12 text-[hsl(var(--cf-text-muted))]">
              No unclassified transactions. Nothing to review.
            </div>
          ) : (
            <div className="space-y-2">
              {sortedTxns.map((tx) => (
                <TransactionRow
                  key={tx.id}
                  tx={tx}
                  coaMap={coaMap}
                  coa={coa}
                  onClassify={(code) => handleClassify(tx.id, code)}
                  onReconcile={() => handleReconcile(tx.id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Reconciled tab */}
      {activeTab === 'reconciled' && (
        <>
          {/* Bulk accept toggle */}
          <div className="flex items-center gap-3 px-4 py-3 bg-[hsl(var(--cf-raised))] border border-[hsl(var(--cf-border))] rounded-lg">
            <label className="flex items-center gap-2 text-sm text-[hsl(var(--cf-text))] cursor-pointer">
              <input
                type="checkbox"
                checked={bulkAcceptDisabled}
                onChange={(e) => {
                  const checked = e.target.checked;
                  updateSettings.mutate(
                    { bulkAcceptDisabled: checked },
                    {
                      onSuccess: () => setLastResult(checked ? 'Bulk-accept disabled for this tenant' : 'Bulk-accept re-enabled'),
                      onError: (err: any) => setLastResult(`Failed to update setting: ${err.message}`),
                    },
                  );
                }}
                disabled={updateSettings.isPending}
                className="rounded border-[hsl(var(--cf-border))]"
              />
              Disable bulk-accept for this tenant
            </label>
            <span className="text-xs text-[hsl(var(--cf-text-muted))]">
              {bulkAcceptDisabled
                ? 'Every transaction requires individual L2 review'
                : 'High-confidence suggestions can be bulk-accepted'}
            </span>
          </div>

          {reconciledLoading ? (
            <div className="text-center py-12 text-[hsl(var(--cf-text-muted))]">Loading...</div>
          ) : reconciledTxns.length === 0 ? (
            <div className="text-center py-12 text-[hsl(var(--cf-text-muted))]">
              No reconciled transactions yet.
            </div>
          ) : (
            <div className="space-y-2">
              {reconciledTxns.map((tx) => (
                <ReconciledRow
                  key={tx.id}
                  tx={tx}
                  coaMap={coaMap}
                  onUnreconcile={() => {
                    unreconcile.mutate(
                      { transactionId: tx.id },
                      {
                        onSuccess: () => setLastResult('Transaction unlocked'),
                        onError: (err: any) => setLastResult(`Error: ${err.message}`),
                      },
                    );
                  }}
                  isUnreconciling={unreconcile.isPending}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Subcomponents ──

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[hsl(var(--cf-raised))] border border-[hsl(var(--cf-border))] rounded-lg p-4">
      <div className="text-xs text-[hsl(var(--cf-text-muted))] uppercase tracking-wider">{label}</div>
      <div className="text-2xl font-display font-semibold text-[hsl(var(--cf-text))] mt-1">{value}</div>
    </div>
  );
}

interface TransactionRowProps {
  tx: UnclassifiedTransaction;
  coaMap: Map<string, ChartOfAccount>;
  coa: ChartOfAccount[];
  onClassify: (code: string) => void;
  onReconcile: () => void;
}

interface ReconciledRowProps {
  tx: UnclassifiedTransaction;
  coaMap: Map<string, ChartOfAccount>;
  onUnreconcile: () => void;
  isUnreconciling: boolean;
}

function ReconciledRow({ tx, coaMap, onUnreconcile, isUnreconciling }: ReconciledRowProps) {
  const [showAudit, setShowAudit] = useState(false);
  const { data: auditLog, isLoading: auditLoading } = useClassificationAudit(showAudit ? tx.id : null);
  const account = tx.coaCode ? coaMap.get(tx.coaCode) : null;
  const amount = parseFloat(tx.amount);

  return (
    <div className="bg-[hsl(var(--cf-raised))] border border-[hsl(var(--cf-border))] rounded-lg p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-3">
            <span className={`text-lg font-display font-semibold ${amount >= 0 ? 'text-green-400' : 'text-[hsl(var(--cf-text))]'}`}>
              {formatCurrency(amount)}
            </span>
            <span className="text-xs text-[hsl(var(--cf-text-muted))]">{formatDate(tx.date)}</span>
            <span className="text-xs text-yellow-400">Reconciled</span>
          </div>
          <div className="text-sm text-[hsl(var(--cf-text))] mt-1 truncate">{tx.description}</div>
          {account && (
            <div className="mt-1 text-xs text-green-400">
              {account.code} — {account.name}
            </div>
          )}
          <div className="mt-1 flex items-center gap-4 text-[10px] text-[hsl(var(--cf-text-muted))]">
            {tx.classifiedBy && (
              <span>Classified by {tx.classifiedBy}{tx.classifiedAt ? ` on ${formatDate(tx.classifiedAt)}` : ''}</span>
            )}
            {tx.reconciledBy && (
              <span>Reconciled by {tx.reconciledBy}{tx.reconciledAt ? ` on ${formatDate(tx.reconciledAt)}` : ''}</span>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          <button
            onClick={() => setShowAudit(!showAudit)}
            className="px-3 py-1.5 text-xs font-medium bg-[hsl(var(--cf-raised))] border border-[hsl(var(--cf-border))] text-[hsl(var(--cf-text-muted))] rounded hover:text-[hsl(var(--cf-text))] transition-colors"
          >
            {showAudit ? 'Hide Trail' : 'Audit Trail'}
          </button>
          <button
            onClick={onUnreconcile}
            disabled={isUnreconciling}
            className="px-3 py-1.5 text-xs font-medium bg-[hsl(var(--cf-raised))] border border-[hsl(var(--cf-border))] text-[hsl(var(--cf-text))] rounded hover:bg-[hsl(var(--cf-surface))] transition-colors disabled:opacity-50"
          >
            Unlock
          </button>
        </div>
      </div>

      {/* Audit trail expansion */}
      {showAudit && (
        <div className="mt-3 pt-3 border-t border-[hsl(var(--cf-border))]">
          {auditLoading ? (
            <div className="text-[10px] text-[hsl(var(--cf-text-muted))]">Loading audit trail...</div>
          ) : auditLog && auditLog.length > 0 ? (
            <div className="space-y-1">
              {auditLog.map((entry) => (
                <div key={entry.id} className="flex items-baseline gap-2 text-[10px]">
                  <span className="text-[hsl(var(--cf-text-muted))] w-[70px] shrink-0">{formatDate(entry.createdAt)}</span>
                  <span className={`w-[60px] shrink-0 ${auditActionColor(entry.action)}`}>{entry.action}</span>
                  <span className="text-[hsl(var(--cf-text))]">{entry.newCoaCode}</span>
                  {entry.previousCoaCode && (
                    <span className="text-[hsl(var(--cf-text-muted))]">(was {entry.previousCoaCode})</span>
                  )}
                  <span className="text-[hsl(var(--cf-text-muted))]">
                    {entry.trustLevel} by {entry.actorId}
                  </span>
                  {entry.confidence && (
                    <span className={confidenceColor(parseFloat(entry.confidence))}>
                      {(parseFloat(entry.confidence) * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[10px] text-[hsl(var(--cf-text-muted))]">No audit entries found</div>
          )}
        </div>
      )}
    </div>
  );
}

function TransactionRow({ tx, coaMap, coa, onClassify, onReconcile }: TransactionRowProps) {
  const suggested = tx.suggestedCoaCode ? coaMap.get(tx.suggestedCoaCode) : null;
  const authoritative = tx.coaCode ? coaMap.get(tx.coaCode) : null;
  const confidence = tx.classificationConfidence ? parseFloat(tx.classificationConfidence) : null;
  const amount = parseFloat(tx.amount);

  return (
    <div className="bg-[hsl(var(--cf-raised))] border border-[hsl(var(--cf-border))] rounded-lg p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-3">
            <span className={`text-lg font-display font-semibold ${amount >= 0 ? 'text-green-400' : 'text-[hsl(var(--cf-text))]'}`}>
              {formatCurrency(amount)}
            </span>
            <span className="text-xs text-[hsl(var(--cf-text-muted))]">{formatDate(tx.date)}</span>
            {tx.category && (
              <span className="text-xs px-2 py-0.5 bg-[hsl(var(--cf-surface))] rounded">
                {tx.category}
              </span>
            )}
          </div>
          <div className="text-sm text-[hsl(var(--cf-text))] mt-1 truncate">{tx.description}</div>

          {/* Suggestion display */}
          {suggested && !authoritative && (
            <div className="mt-2 text-xs">
              <span className="text-[hsl(var(--cf-text-muted))]">Suggested: </span>
              <span className="text-[hsl(var(--cf-text))]">
                {suggested.code} — {suggested.name}
              </span>
              {confidence !== null && (
                <span className={`ml-2 ${confidenceColor(confidence)}`}>
                  {(confidence * 100).toFixed(0)}% confidence
                </span>
              )}
            </div>
          )}

          {authoritative && (
            <div className="mt-2 text-xs">
              <span className="text-green-400">Classified: </span>
              <span className="text-[hsl(var(--cf-text))]">
                {authoritative.code} — {authoritative.name}
              </span>
              {tx.reconciled && <span className="ml-2 text-yellow-400">🔒 Reconciled</span>}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1.5 shrink-0">
          {suggested && !authoritative && (
            <button
              onClick={() => onClassify(suggested.code)}
              className="px-3 py-1.5 text-xs font-medium bg-[hsl(var(--cf-lime))] text-black rounded hover:bg-[hsl(var(--cf-lime-bright))] transition-colors"
            >
              Accept {suggested.code}
            </button>
          )}

          <select
            onChange={(e) => {
              if (e.target.value) onClassify(e.target.value);
              e.target.value = '';
            }}
            className="px-2 py-1.5 text-xs bg-[hsl(var(--cf-surface))] border border-[hsl(var(--cf-border))] rounded text-[hsl(var(--cf-text))] max-w-[180px]"
            defaultValue=""
          >
            <option value="" disabled>
              Classify as...
            </option>
            {coa.map((a) => (
              <option key={a.id} value={a.code}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>

          {authoritative && !tx.reconciled && (
            <button
              onClick={onReconcile}
              className="px-3 py-1.5 text-xs font-medium bg-[hsl(var(--cf-raised))] border border-[hsl(var(--cf-border))] text-[hsl(var(--cf-text))] rounded hover:bg-[hsl(var(--cf-surface))] transition-colors"
            >
              Reconcile
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
