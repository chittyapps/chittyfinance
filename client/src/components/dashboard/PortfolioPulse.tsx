import { TrendingUp, TrendingDown, DollarSign, Home, Percent } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface PortfolioPulseProps {
  cashOnHand: number;
  monthlyRevenue: number;
  monthlyExpenses: number;
  isLoading?: boolean;
}

export default function PortfolioPulse({
  cashOnHand,
  monthlyRevenue,
  monthlyExpenses,
  isLoading
}: PortfolioPulseProps) {
  const netOperatingIncome = monthlyRevenue - monthlyExpenses;
  const cashFlowTrend = netOperatingIncome > 0 ? "positive" : "negative";

  if (isLoading) {
    return (
      <div className="apple-card p-8">
        <Skeleton className="h-8 w-48 mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </div>
    );
  }

  return (
    <div className="apple-card p-8 fade-slide-in" data-testid="card-portfolio-pulse">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold mb-1">Portfolio Pulse</h2>
          <p className="text-sm text-muted-foreground">
            Your financial health at a glance
          </p>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${
          cashFlowTrend === "positive" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
        }`}>
          {cashFlowTrend === "positive" ? (
            <TrendingUp className="w-4 h-4" />
          ) : (
            <TrendingDown className="w-4 h-4" />
          )}
          <span className="text-sm font-medium">
            {cashFlowTrend === "positive" ? "Healthy" : "Needs Attention"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MetricCard
          icon={<DollarSign className="w-5 h-5" />}
          label="Cash Position"
          value={`$${cashOnHand.toLocaleString()}`}
          testId="metric-cash-position"
        />
        <MetricCard
          icon={<Home className="w-5 h-5" />}
          label="Monthly Revenue"
          value={`$${monthlyRevenue.toLocaleString()}`}
          testId="metric-revenue"
        />
        <MetricCard
          icon={<Percent className="w-5 h-5" />}
          label="Net Operating Income"
          value={`$${netOperatingIncome.toLocaleString()}`}
          change={cashFlowTrend === "positive" ? "+12%" : "-8%"}
          testId="metric-noi"
        />
      </div>
    </div>
  );
}

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  change?: string;
  testId?: string;
}

function MetricCard({ icon, label, value, change, testId }: MetricCardProps) {
  return (
    <div className="flex items-center gap-4" data-testid={testId}>
      <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-primary">
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-sm text-muted-foreground mb-0.5">{label}</p>
        <div className="flex items-baseline gap-2">
          <p className="text-xl font-semibold">{value}</p>
          {change && (
            <span className={`text-xs font-medium ${
              change.startsWith("+") ? "text-primary" : "text-destructive"
            }`}>
              {change}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
