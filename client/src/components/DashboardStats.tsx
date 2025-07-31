import { Card, CardContent } from "@/components/ui/card";

interface DashboardStatsProps {
  stats?: {
    totalLent: number;
    activeLoans: number;
    avgInterestRate: number;
    onTimeRate: number;
  };
  isLoading: boolean;
}

export default function DashboardStats({ stats, isLoading }: DashboardStatsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
        {[1, 2, 3, 4].map(i => (
          <Card key={i} className="loan-card animate-pulse">
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 bg-neutral-200 rounded-xl mx-auto mb-4"></div>
              <div className="h-8 bg-neutral-200 rounded mb-2"></div>
              <div className="h-4 bg-neutral-200 rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
      <Card className="loan-card">
        <CardContent className="p-6 text-center">
          <div className="w-12 h-12 bg-gradient-to-r from-secondary to-emerald-400 rounded-xl mx-auto mb-4 flex items-center justify-center">
            <i className="fas fa-chart-line text-white text-xl"></i>
          </div>
          <h3 className="text-2xl font-bold text-neutral-800">
            {formatCurrency(stats?.totalLent || 0)}
          </h3>
          <p className="text-neutral-600">Total Lent</p>
        </CardContent>
      </Card>

      <Card className="loan-card">
        <CardContent className="p-6 text-center">
          <div className="w-12 h-12 bg-gradient-to-r from-primary to-blue-400 rounded-xl mx-auto mb-4 flex items-center justify-center">
            <i className="fas fa-clock text-white text-xl"></i>
          </div>
          <h3 className="text-2xl font-bold text-neutral-800">
            {stats?.activeLoans || 0}
          </h3>
          <p className="text-neutral-600">Active Loans</p>
        </CardContent>
      </Card>

      <Card className="loan-card">
        <CardContent className="p-6 text-center">
          <div className="w-12 h-12 bg-gradient-to-r from-accent to-purple-400 rounded-xl mx-auto mb-4 flex items-center justify-center">
            <i className="fas fa-percentage text-white text-xl"></i>
          </div>
          <h3 className="text-2xl font-bold text-neutral-800">
            {formatPercentage(stats?.avgInterestRate || 0)}
          </h3>
          <p className="text-neutral-600">Avg Interest</p>
        </CardContent>
      </Card>

      <Card className="loan-card">
        <CardContent className="p-6 text-center">
          <div className="w-12 h-12 bg-gradient-to-r from-emerald-500 to-green-400 rounded-xl mx-auto mb-4 flex items-center justify-center">
            <i className="fas fa-check-circle text-white text-xl"></i>
          </div>
          <h3 className="text-2xl font-bold text-neutral-800">
            {formatPercentage(stats?.onTimeRate || 0)}
          </h3>
          <p className="text-neutral-600">On-Time Rate</p>
        </CardContent>
      </Card>
    </div>
  );
}
