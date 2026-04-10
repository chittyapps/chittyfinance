import { useMemo, useState } from 'react';
import {
  useChartOfAccounts,
  useClassificationStats,
  useUnclassifiedTransactions,
  useClassifyTransaction,
  useReconcileTransaction,
  useAiSuggest,
  useBatchSuggest,
  type UnclassifiedTransaction,
  type ChartOfAccount,
} from '@/hooks/use-classification';

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
  const { data: coa = [] } = useChartOfAccounts();
  const classify = useClassifyTransaction();
  const reconcile = useReconcileTransaction();
  const aiSuggest = useAiSuggest();
  const batchSuggest = useBatchSuggest();

  const [sortMode, setSortMode] = useState<SortMode>('date-desc');
  const [lastResult, setLastResult] = useState<string | null>(null);

  const coaMap = useMemo(() => new Map(coa.map((a) => [a.code, a])), [coa]);
  const sortedTxns = useMemo(() => [...txns].sort((a, b) => compareTransactions(a, b, sortMode)), [txns, sortMode]);

  function handleClassify(txId: string, coaCode: string) {
    classify.mutate(
      { transactionId: txId, coaCode, reason: 'Manual classification via UI' },
      { onSuccess: () => setLastResult(`Classified transaction as ${coaCode}`) },
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
    // Fire mutations sequentially to avoid overloading the classify endpoint
    let done = 0;
    for (const tx of candidates) {
      if (!tx.suggestedCoaCode) continue;
      classify.mutate(
        { transactionId: tx.id, coaCode: tx.suggestedCoaCode, reason: 'Bulk accept: high-confidence suggestion' },
        {
          onSuccess: () => {
            done++;
            if (done === candidates.length) setLastResult(`Bulk accepted ${done} transactions`);
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
          <button
            onClick={handleAcceptAll}
            disabled={classify.isPending}
            className="px-3 py-2 text-sm font-medium bg-[hsl(var(--cf-raised))] border border-[hsl(var(--cf-border))] text-[hsl(var(--cf-text))] rounded-md hover:bg-[hsl(var(--cf-surface))] transition-colors disabled:opacity-50"
          >
            Accept High-Confidence
          </button>
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

      {/* Transaction queue */}
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
