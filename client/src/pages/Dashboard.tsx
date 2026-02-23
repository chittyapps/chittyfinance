import { useRole } from "@/contexts/RoleContext";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
  FileText, AlertCircle, CheckCircle2,
  Clock, ChevronRight, Zap, Banknote,
  ArrowLeftRight, CircleDollarSign, Receipt
} from "lucide-react";
import { motion } from "framer-motion";

/* ─── Animation Variants ─── */
const stagger = {
  animate: { transition: { staggerChildren: 0.06 } },
};

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] } },
};

/* ═══════════════════════════════════════════════
   CFO DASHBOARD — Executive Overview
   ═══════════════════════════════════════════════ */
function CFODashboard() {
  return (
    <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-6">
      {/* KPI Row */}
      <motion.div variants={fadeUp} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          label="Total Cash Position"
          value="$347,892.41"
          delta="+4.2%"
          positive
          icon={<CircleDollarSign className="w-4 h-4" />}
        />
        <MetricCard
          label="Monthly Revenue"
          value="$28,450.00"
          delta="+12.8%"
          positive
          icon={<TrendingUp className="w-4 h-4" />}
        />
        <MetricCard
          label="Monthly Burn"
          value="$19,234.67"
          delta="-3.1%"
          positive
          icon={<TrendingDown className="w-4 h-4" />}
        />
        <MetricCard
          label="Net Cash Flow"
          value="$9,215.33"
          delta="+18.2%"
          positive
          icon={<Banknote className="w-4 h-4" />}
        />
      </motion.div>

      {/* Entity Breakdown + Cash Flow */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Entity P&L Breakdown */}
        <motion.div variants={fadeUp} className="lg:col-span-2 cf-card">
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <h3 className="cf-section-title">Entity Performance</h3>
            <button className="text-[10px] font-medium text-[hsl(var(--cf-lime))] hover:underline">
              View Full P&L
            </button>
          </div>
          <div className="px-4 pb-4">
            <div className="space-y-1">
              <EntityRow name="ARIBIA LLC - MGMT" revenue={18200} expenses={12400} />
              <EntityRow name="City Studio (550 W Surf)" revenue={4800} expenses={3200} />
              <EntityRow name="Apt Arlene (4343 Clarendon)" revenue={3450} expenses={2100} />
              <EntityRow name="JAV LLC" revenue={2000} expenses={1534} />
            </div>
          </div>
        </motion.div>

        {/* Cash Accounts */}
        <motion.div variants={fadeUp} className="cf-card">
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <h3 className="cf-section-title">Accounts</h3>
            <span className="text-[10px] font-mono text-[hsl(var(--cf-text-muted))]">4 active</span>
          </div>
          <div className="px-2 pb-3 space-y-0.5">
            <AccountRow name="Mercury Checking" institution="Mercury" balance={245892.41} type="checking" />
            <AccountRow name="Mercury Savings" institution="Mercury" balance={85000.00} type="savings" />
            <AccountRow name="Operating CC" institution="Chase" balance={-12450.33} type="credit" />
            <AccountRow name="Stripe Balance" institution="Stripe" balance={29450.33} type="checking" />
          </div>
        </motion.div>
      </div>

      {/* Recent Activity + Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <motion.div variants={fadeUp} className="cf-card">
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <h3 className="cf-section-title">Recent Transactions</h3>
            <button className="text-[10px] font-medium text-[hsl(var(--cf-lime))] hover:underline flex items-center gap-0.5">
              All <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="pb-2">
            <TransactionRow description="Cloudflare Workers" amount={-215.00} date="Feb 23" category="Infrastructure" />
            <TransactionRow description="CFC Guest — Surf 504" amount={4800.00} date="Feb 22" category="Rent Income" />
            <TransactionRow description="ComEd Electric" amount={-142.87} date="Feb 21" category="Utilities" />
            <TransactionRow description="Stripe Payout" amount={2340.00} date="Feb 20" category="Revenue" />
            <TransactionRow description="1Password Business" amount={-7.99} date="Feb 19" category="Software" />
          </div>
        </motion.div>

        <motion.div variants={fadeUp} className="cf-card">
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <h3 className="cf-section-title">Action Items</h3>
            <span className="text-[10px] font-mono bg-[hsl(var(--cf-amber)/0.15)] text-[hsl(var(--cf-amber))] px-1.5 py-0.5 rounded">
              3 pending
            </span>
          </div>
          <div className="px-4 pb-4 space-y-2">
            <ActionItem
              title="Review Wave reconciliation"
              priority="high"
              dueDate="Today"
              icon={<AlertCircle className="w-3.5 h-3.5" />}
            />
            <ActionItem
              title="Approve vendor payment — Chitty Svc"
              priority="medium"
              dueDate="Tomorrow"
              icon={<Clock className="w-3.5 h-3.5" />}
            />
            <ActionItem
              title="Q1 tax estimate due"
              priority="high"
              dueDate="Mar 15"
              icon={<FileText className="w-3.5 h-3.5" />}
            />
            <ActionItem
              title="Mercury account review complete"
              priority="done"
              icon={<CheckCircle2 className="w-3.5 h-3.5" />}
            />
          </div>
        </motion.div>
      </div>

      {/* Quick Integrations Status */}
      <motion.div variants={fadeUp} className="cf-card">
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <h3 className="cf-section-title">Connected Services</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 px-4 pb-4">
          <ServiceStatus name="Mercury Bank" status="connected" lastSync="2m ago" />
          <ServiceStatus name="Wave Accounting" status="connected" lastSync="1h ago" />
          <ServiceStatus name="Stripe Payments" status="connected" lastSync="5m ago" />
          <ServiceStatus name="DoorLoop" status="disconnected" lastSync="—" />
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════
   ACCOUNTANT DASHBOARD
   ═══════════════════════════════════════════════ */
function AccountantDashboard() {
  return (
    <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-6">
      <motion.div variants={fadeUp} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Unreconciled" value="23" delta="items" icon={<ArrowLeftRight className="w-4 h-4" />} />
        <MetricCard label="Outstanding AR" value="$12,450.00" delta="4 invoices" icon={<FileText className="w-4 h-4" />} />
        <MetricCard label="Outstanding AP" value="$8,234.00" delta="6 bills" icon={<Receipt className="w-4 h-4" />} />
        <MetricCard label="GL Balance" value="$347,892.41" delta="Balanced" positive icon={<CheckCircle2 className="w-4 h-4" />} />
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <motion.div variants={fadeUp} className="cf-card">
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <h3 className="cf-section-title">Reconciliation Queue</h3>
            <span className="text-[10px] font-mono text-[hsl(var(--cf-amber))]">23 pending</span>
          </div>
          <div className="pb-2">
            <ReconciliationRow account="Mercury Checking" unmatched={12} lastRecon="Feb 20" status="needs_review" />
            <ReconciliationRow account="Mercury Savings" unmatched={3} lastRecon="Feb 22" status="in_progress" />
            <ReconciliationRow account="Chase CC" unmatched={8} lastRecon="Feb 18" status="needs_review" />
            <ReconciliationRow account="Stripe" unmatched={0} lastRecon="Feb 23" status="complete" />
          </div>
        </motion.div>

        <motion.div variants={fadeUp} className="cf-card">
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <h3 className="cf-section-title">Aging Summary</h3>
          </div>
          <div className="px-4 pb-4 space-y-3">
            <AgingBar label="Current" amount={8200} percentage={66} color="emerald" />
            <AgingBar label="1-30 days" amount={2450} percentage={20} color="amber" />
            <AgingBar label="31-60 days" amount={1200} percentage={10} color="orange" />
            <AgingBar label="60+ days" amount={600} percentage={5} color="rose" />
          </div>
        </motion.div>
      </div>

      <motion.div variants={fadeUp} className="cf-card">
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <h3 className="cf-section-title">Recent Journal Entries</h3>
          <button className="text-[10px] font-medium text-[hsl(var(--cf-lime))] hover:underline">New Entry</button>
        </div>
        <div className="pb-2">
          <JournalRow date="Feb 23" ref_="JE-2026-047" description="Monthly depreciation" debit={1250} credit={1250} />
          <JournalRow date="Feb 22" ref_="JE-2026-046" description="Rent income accrual — City Studio" debit={4800} credit={4800} />
          <JournalRow date="Feb 21" ref_="JE-2026-045" description="Utility expense allocation" debit={342.87} credit={342.87} />
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════
   BOOKKEEPER DASHBOARD
   ═══════════════════════════════════════════════ */
function BookkeeperDashboard() {
  return (
    <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-6">
      <motion.div variants={fadeUp} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Uncategorized" value="14" delta="transactions" icon={<Zap className="w-4 h-4" />} />
        <MetricCard label="Pending Review" value="7" delta="receipts" icon={<Receipt className="w-4 h-4" />} />
        <MetricCard label="Bank Feed" value="31" delta="new today" icon={<ArrowDownRight className="w-4 h-4" />} />
        <MetricCard label="Matched" value="89%" delta="+2% this week" positive icon={<CheckCircle2 className="w-4 h-4" />} />
      </motion.div>

      <motion.div variants={fadeUp} className="cf-card">
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <h3 className="cf-section-title">Uncategorized Transactions</h3>
          <div className="flex gap-2">
            <button className="text-[10px] font-medium px-2 py-1 rounded bg-[hsl(var(--cf-lime)/0.1)] text-[hsl(var(--cf-lime))] hover:bg-[hsl(var(--cf-lime)/0.2)] transition-colors">
              Auto-categorize
            </button>
          </div>
        </div>
        <div className="pb-2">
          <UncategorizedRow description="AMZN MKTP US*2X4K9" amount={-89.47} date="Feb 23" suggestion="Office Supplies" />
          <UncategorizedRow description="GOOGLE *CLOUD" amount={-342.10} date="Feb 23" suggestion="Cloud Services" />
          <UncategorizedRow description="UBER TRIP" amount={-24.50} date="Feb 22" suggestion="Transportation" />
          <UncategorizedRow description="TRANSFER FROM SAVINGS" amount={5000.00} date="Feb 22" suggestion="Internal Transfer" />
          <UncategorizedRow description="CHECK DEPOSIT #1847" amount={2400.00} date="Feb 21" suggestion="Rental Income" />
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <motion.div variants={fadeUp} className="cf-card">
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <h3 className="cf-section-title">Bank Feed</h3>
            <span className="text-[10px] font-mono text-emerald-400">Live</span>
          </div>
          <div className="pb-2">
            <TransactionRow description="Mercury — ACH Credit" amount={12500.00} date="Just now" category="Income" />
            <TransactionRow description="Mercury — Wire Out" amount={-3200.00} date="2h ago" category="Vendor" />
            <TransactionRow description="Chase — Purchase" amount={-156.23} date="3h ago" category="Supplies" />
          </div>
        </motion.div>

        <motion.div variants={fadeUp} className="cf-card">
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <h3 className="cf-section-title">Pending Receipts</h3>
          </div>
          <div className="px-4 pb-4 space-y-2">
            <ReceiptItem vendor="Home Depot" amount={234.56} daysOld={2} />
            <ReceiptItem vendor="Staples" amount={89.00} daysOld={5} />
            <ReceiptItem vendor="Best Buy" amount={449.99} daysOld={7} />
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════
   END USER DASHBOARD
   ═══════════════════════════════════════════════ */
function UserDashboard() {
  return (
    <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-6">
      <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3">
        <MetricCard label="My Expenses" value="$1,247.33" delta="This month" icon={<Receipt className="w-4 h-4" />} />
        <MetricCard label="Pending Approvals" value="2" delta="items" icon={<Clock className="w-4 h-4" />} />
      </motion.div>

      <motion.div variants={fadeUp} className="cf-card">
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <h3 className="cf-section-title">My Recent Expenses</h3>
          <button className="text-[10px] font-medium px-2 py-1 rounded bg-[hsl(var(--cf-lime)/0.1)] text-[hsl(var(--cf-lime))] hover:bg-[hsl(var(--cf-lime)/0.2)] transition-colors">
            Submit Expense
          </button>
        </div>
        <div className="pb-2">
          <TransactionRow description="Uber — Client Meeting" amount={-34.50} date="Feb 23" category="Transportation" />
          <TransactionRow description="Office Depot — Supplies" amount={-89.00} date="Feb 22" category="Office" />
          <TransactionRow description="Lunch — Team Meeting" amount={-67.83} date="Feb 21" category="Meals" />
        </div>
      </motion.div>

      <motion.div variants={fadeUp} className="cf-card">
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <h3 className="cf-section-title">Pending Approvals</h3>
        </div>
        <div className="px-4 pb-4 space-y-2">
          <ApprovalItem title="Q1 Software License Renewal" amount={2400} requester="Chitty Services" status="pending" />
          <ApprovalItem title="Office Equipment Purchase" amount={899} requester="ARIBIA MGMT" status="pending" />
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════
   SHARED SUB-COMPONENTS
   ═══════════════════════════════════════════════ */

function MetricCard({
  label, value, delta, positive, icon,
}: {
  label: string; value: string; delta?: string; positive?: boolean; icon: React.ReactNode;
}) {
  return (
    <div className="cf-metric cf-card-glow">
      <div className="flex items-center justify-between mb-2">
        <span className="cf-metric-label">{label}</span>
        <span className="text-[hsl(var(--cf-text-muted))]">{icon}</span>
      </div>
      <div className="cf-metric-value">{value}</div>
      {delta && (
        <div
          className="cf-metric-delta"
          data-positive={positive ? "" : undefined}
          data-negative={positive === false ? "" : undefined}
        >
          {positive !== undefined && (
            positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />
          )}
          {delta}
        </div>
      )}
    </div>
  );
}

function EntityRow({ name, revenue, expenses }: { name: string; revenue: number; expenses: number }) {
  const net = revenue - expenses;
  const margin = revenue > 0 ? ((net / revenue) * 100).toFixed(0) : "0";
  return (
    <div className="cf-table-row">
      <div className="flex-1 min-w-0">
        <span className="text-sm text-[hsl(var(--cf-text))] truncate block">{name}</span>
      </div>
      <div className="flex items-center gap-6 text-xs font-mono">
        <span className="text-emerald-400 w-20 text-right">{formatCurrency(revenue)}</span>
        <span className="text-rose-400 w-20 text-right">{formatCurrency(expenses)}</span>
        <span className={`w-20 text-right font-semibold ${net >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
          {formatCurrency(net)}
        </span>
        <span className="text-[hsl(var(--cf-text-muted))] w-12 text-right">{margin}%</span>
      </div>
    </div>
  );
}

function AccountRow({ name, institution, balance, type }: { name: string; institution: string; balance: number; type: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded hover:bg-[hsl(var(--cf-raised))] transition-colors cursor-pointer group">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded bg-[hsl(var(--cf-raised))] border border-[hsl(var(--cf-border-subtle))] flex items-center justify-center text-[10px] font-mono font-semibold text-[hsl(var(--cf-text-muted))]">
          {institution.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="text-sm text-[hsl(var(--cf-text))] truncate">{name}</div>
          <div className="text-[10px] text-[hsl(var(--cf-text-muted))] capitalize">{type}</div>
        </div>
      </div>
      <span className={`text-sm font-mono font-medium ${balance >= 0 ? "text-[hsl(var(--cf-text))]" : "text-rose-400"}`}>
        {formatCurrency(balance)}
      </span>
    </div>
  );
}

function TransactionRow({ description, amount, date, category }: { description: string; amount: number; date: string; category: string }) {
  return (
    <div className="cf-table-row px-4">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-[hsl(var(--cf-text))] truncate">{description}</div>
        <div className="text-[10px] text-[hsl(var(--cf-text-muted))]">{category}</div>
      </div>
      <div className="flex items-center gap-4">
        <span className={`text-sm font-mono font-medium ${amount >= 0 ? "amount-positive" : "amount-negative"}`}>
          {amount >= 0 ? "+" : ""}{formatCurrency(amount)}
        </span>
        <span className="text-[10px] text-[hsl(var(--cf-text-muted))] w-14 text-right">{date}</span>
      </div>
    </div>
  );
}

function ActionItem({
  title, priority, dueDate, icon,
}: {
  title: string; priority: "high" | "medium" | "low" | "done"; dueDate?: string; icon: React.ReactNode;
}) {
  const colors = {
    high: "text-rose-400",
    medium: "text-amber-400",
    low: "text-[hsl(var(--cf-text-muted))]",
    done: "text-emerald-400",
  };
  return (
    <div className={`flex items-center gap-3 py-1.5 ${priority === "done" ? "opacity-50" : ""}`}>
      <span className={colors[priority]}>{icon}</span>
      <span className={`flex-1 text-sm ${priority === "done" ? "line-through text-[hsl(var(--cf-text-muted))]" : "text-[hsl(var(--cf-text))]"}`}>
        {title}
      </span>
      {dueDate && <span className="text-[10px] font-mono text-[hsl(var(--cf-text-muted))]">{dueDate}</span>}
    </div>
  );
}

function ServiceStatus({ name, status, lastSync }: { name: string; status: "connected" | "disconnected"; lastSync: string }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded bg-[hsl(var(--cf-raised))] border border-[hsl(var(--cf-border-subtle))]">
      <div
        className="cf-status-dot"
        data-status={status === "connected" ? "healthy" : "down"}
      />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-[hsl(var(--cf-text))] truncate">{name}</div>
        <div className="text-[10px] text-[hsl(var(--cf-text-muted))]">{lastSync}</div>
      </div>
    </div>
  );
}

function ReconciliationRow({ account, unmatched, lastRecon, status }: {
  account: string; unmatched: number; lastRecon: string; status: "complete" | "in_progress" | "needs_review";
}) {
  const statusColors = {
    complete: "text-emerald-400",
    in_progress: "text-cyan-400",
    needs_review: "text-amber-400",
  };
  const statusLabels = {
    complete: "Complete",
    in_progress: "In Progress",
    needs_review: "Needs Review",
  };
  return (
    <div className="cf-table-row px-4">
      <div className="flex-1">
        <span className="text-sm text-[hsl(var(--cf-text))]">{account}</span>
      </div>
      <div className="flex items-center gap-4 text-xs">
        <span className="font-mono text-[hsl(var(--cf-text-muted))]">Last: {lastRecon}</span>
        {unmatched > 0 && (
          <span className="font-mono text-amber-400">{unmatched} unmatched</span>
        )}
        <span className={`font-medium ${statusColors[status]}`}>{statusLabels[status]}</span>
      </div>
    </div>
  );
}

function AgingBar({ label, amount, percentage, color }: {
  label: string; amount: number; percentage: number; color: string;
}) {
  const barColor = {
    emerald: "bg-emerald-400",
    amber: "bg-amber-400",
    orange: "bg-orange-400",
    rose: "bg-rose-400",
  }[color] || "bg-zinc-400";

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-[hsl(var(--cf-text-secondary))]">{label}</span>
        <span className="text-xs font-mono text-[hsl(var(--cf-text))]">{formatCurrency(amount)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-[hsl(var(--cf-raised))]">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function JournalRow({ date, ref_, description, debit, credit }: {
  date: string; ref_: string; description: string; debit: number; credit: number;
}) {
  return (
    <div className="cf-table-row px-4">
      <span className="text-[10px] font-mono text-[hsl(var(--cf-text-muted))] w-14">{date}</span>
      <span className="text-[10px] font-mono text-[hsl(var(--cf-cyan))] w-24">{ref_}</span>
      <span className="flex-1 text-sm text-[hsl(var(--cf-text))] truncate">{description}</span>
      <span className="text-xs font-mono text-[hsl(var(--cf-text))] w-20 text-right">{formatCurrency(debit)}</span>
      <span className="text-xs font-mono text-[hsl(var(--cf-text))] w-20 text-right">{formatCurrency(credit)}</span>
    </div>
  );
}

function UncategorizedRow({ description, amount, date, suggestion }: {
  description: string; amount: number; date: string; suggestion: string;
}) {
  return (
    <div className="cf-table-row px-4 group">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-[hsl(var(--cf-text))] truncate font-mono">{description}</div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-[hsl(var(--cf-text-muted))]">{date}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[hsl(var(--cf-lime)/0.1)] text-[hsl(var(--cf-lime))]">
            {suggestion}
          </span>
        </div>
      </div>
      <span className={`text-sm font-mono font-medium ${amount >= 0 ? "amount-positive" : "amount-negative"}`}>
        {amount >= 0 ? "+" : ""}{formatCurrency(amount)}
      </span>
      <button className="ml-3 opacity-0 group-hover:opacity-100 text-[10px] px-2 py-1 rounded bg-[hsl(var(--cf-lime))] text-black font-medium transition-opacity">
        Accept
      </button>
    </div>
  );
}

function ReceiptItem({ vendor, amount, daysOld }: { vendor: string; amount: number; daysOld: number }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div>
        <span className="text-sm text-[hsl(var(--cf-text))]">{vendor}</span>
        <span className="text-[10px] text-[hsl(var(--cf-text-muted))] ml-2">{daysOld}d ago</span>
      </div>
      <span className="text-sm font-mono text-[hsl(var(--cf-text))]">{formatCurrency(amount)}</span>
    </div>
  );
}

function ApprovalItem({ title, amount, requester, status }: {
  title: string; amount: number; requester: string; status: "pending" | "approved" | "rejected";
}) {
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded bg-[hsl(var(--cf-raised))] border border-[hsl(var(--cf-border-subtle))]">
      <div>
        <div className="text-sm text-[hsl(var(--cf-text))]">{title}</div>
        <div className="text-[10px] text-[hsl(var(--cf-text-muted))]">From: {requester}</div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-mono text-[hsl(var(--cf-text))]">{formatCurrency(amount)}</span>
        {status === "pending" && (
          <div className="flex gap-1">
            <button className="text-[10px] px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 font-medium hover:bg-emerald-500/30 transition-colors">
              Approve
            </button>
            <button className="text-[10px] px-2 py-1 rounded bg-rose-500/20 text-rose-400 font-medium hover:bg-rose-500/30 transition-colors">
              Reject
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MAIN DASHBOARD — Role Router
   ═══════════════════════════════════════════════ */
export default function Dashboard() {
  const { currentRole, roleConfig } = useRole();

  const dashboards: Record<string, React.ComponentType> = {
    cfo: CFODashboard,
    accountant: AccountantDashboard,
    bookkeeper: BookkeeperDashboard,
    user: UserDashboard,
  };

  const ActiveDashboard = dashboards[currentRole] || CFODashboard;

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
      {/* Page Title */}
      <div className="mb-6">
        <h1 className="text-xl font-display font-semibold text-[hsl(var(--cf-text))]">
          {currentRole === "cfo" ? "Executive Overview" :
           currentRole === "accountant" ? "Accounting Dashboard" :
           currentRole === "bookkeeper" ? "Bookkeeping" :
           "My Dashboard"}
        </h1>
        <p className="text-xs text-[hsl(var(--cf-text-muted))] mt-1">
          {roleConfig.description} · {formatDate(new Date())}
        </p>
      </div>

      <ActiveDashboard />
    </div>
  );
}
