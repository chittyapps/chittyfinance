import { useQuery } from "@tanstack/react-query";
import { FinancialSummary } from "@shared/schema";
import PortfolioPulse from "@/components/dashboard/PortfolioPulse";
import AIConcierge from "@/components/dashboard/AIConcierge";
import PropertyWatchlist from "@/components/dashboard/PropertyWatchlist";
import ActionableTasks from "@/components/dashboard/ActionableTasks";
import ChargeAutomation from "@/components/dashboard/ChargeAutomation";
import { FocusModeProvider, FocusModeToggle } from "@/components/dashboard/FocusMode";
import { AlertCircle } from "lucide-react";

export default function Dashboard() {
  const { data: financialSummary, isLoading: isLoadingSummary } = useQuery<FinancialSummary>({
    queryKey: ["/api/financial-summary"],
  });

  return (
    <FocusModeProvider>
      <div className="container-apple py-8 space-lg">
        {/* Page Header with Focus Mode */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight mb-2" data-testid="text-page-title">
              Portfolio Overview
            </h1>
            <p className="text-muted-foreground">
              Real-time insights for your property portfolio
            </p>
          </div>
          <FocusModeToggle />
        </div>

        {/* Main Content */}
        <div className="space-lg">
          {/* Portfolio Pulse - Hero Card */}
          <div className="focus-active">
            <PortfolioPulse
              cashOnHand={financialSummary?.cashOnHand || 0}
              monthlyRevenue={financialSummary?.monthlyRevenue || 0}
              monthlyExpenses={financialSummary?.monthlyExpenses || 0}
              isLoading={isLoadingSummary}
            />
          </div>

          {/* Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="space-md">
              <div className="focus-active">
                <ActionableTasks />
              </div>
              <PropertyWatchlist />
            </div>

            {/* Right Column */}
            <div className="space-md">
              <div className="focus-active">
                <AIConcierge />
              </div>
              <ChargeAutomation />
            </div>
          </div>

          {/* Sticky Guidance - ADHD Support */}
          <div className="sticky-guide" data-testid="card-guidance">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-sky flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium mb-1">Quick Tip</p>
                <p className="text-muted-foreground">
                  Use Focus Mode to concentrate on priority tasks. Toggle it on to dim non-essential
                  cards and highlight what needs your attention right now.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </FocusModeProvider>
  );
}
