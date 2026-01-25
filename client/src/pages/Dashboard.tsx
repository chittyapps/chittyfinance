import { useQuery } from "@tanstack/react-query";
import { FinancialSummary, Integration } from "@shared/schema";
import FinancialSummaryComponent from "@/components/dashboard/FinancialSummary";
import AICFOAssistant from "@/components/dashboard/AICFOAssistant";
import ConnectedServices from "@/components/dashboard/ConnectedServices";
import RecentTransactions from "@/components/dashboard/RecentTransactions";
import FinancialTasks from "@/components/dashboard/FinancialTasks";
import ChargeAutomation from "@/components/dashboard/ChargeAutomation";
import GitHubRepositories from "@/components/dashboard/GitHubRepositories";
import { formatDate } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function Dashboard() {
  // Get financial summary data
  const { data: financialSummary, isLoading: isLoadingSummary } = useQuery<FinancialSummary>({
    queryKey: ["/api/financial-summary"],
  });

  // Pull integrations to detect Mercury selection state
  const { data: integrations } = useQuery<Integration[]>({ queryKey: ["/api/integrations"] });
  const mercury = integrations?.find((i) => i.serviceType === "mercury_bank");
  const selectedIds: string[] = (mercury?.credentials as any)?.selectedAccountIds || [];

  return (
    <div className="py-6">
      {/* Page Header */}
      <div className="px-4 sm:px-6 md:px-8">
        <h1 className="text-3xl font-bold gradient-text">
          Chitty Services CFO Dashboard
        </h1>
        
        <div className="mt-2 flex items-center text-sm text-zinc-400">
          {/* AI Assistant Status */}
          <div className="flex items-center">
            <div className="h-2.5 w-2.5 rounded-full bg-lime-400 pulse-connection mr-1.5"></div>
            <span>AI CFO Assistant Active</span>
          </div>
          <span className="mx-2">•</span>
          <div>Last updated: {formatDate(new Date())}</div>
        </div>
      </div>

      {/* Financial Summary Section */}
      <div className="px-4 sm:px-6 md:px-8 mt-8">
        <div className="mb-4 space-y-3">
          {(!selectedIds || selectedIds.length === 0) && (
            <Alert className="border-orange-500/40 bg-orange-50 dark:bg-orange-950/30">
              <AlertTitle>Connect Mercury via ChittyConnect</AlertTitle>
              <AlertDescription>
                No Mercury accounts selected. Connect and choose which accounts to sync for accurate balances and transactions.
                <div className="mt-2 flex gap-2">
                  <a href="/connect" target="_blank" rel="noreferrer" className="underline text-orange-600 dark:text-orange-400">Connect</a>
                  <span>·</span>
                  <a href="/settings#mercury-accounts" className="underline text-orange-600 dark:text-orange-400">Manage accounts</a>
                </div>
              </AlertDescription>
            </Alert>
          )}
          {selectedIds && selectedIds.length > 0 && (
            <Badge variant="secondary" className="w-fit">
              {selectedIds.length} {selectedIds.length === 1 ? 'account' : 'accounts'} syncing
            </Badge>
          )}
          <Link href="/settings#mercury-accounts">
            <Button variant="outline" className="border-orange-500 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/30">
              Manage Mercury accounts
            </Button>
          </Link>
        </div>
        <FinancialSummaryComponent 
          data={financialSummary} 
          isLoading={isLoadingSummary} 
        />

        {/* AI CFO Assistant Section */}
        <div className="mt-8">
          <AICFOAssistant />
        </div>

        {/* Integrations Section */}
        <div className="mt-8">
          <ConnectedServices />
        </div>
        
        {/* Charge Automation Section */}
        <div className="mt-8">
          <ChargeAutomation />
        </div>

        {/* GitHub Repositories Section */}
        <div className="mt-8">
          <GitHubRepositories />
        </div>

        {/* Recent Transactions and Tasks */}
        <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <RecentTransactions />
          <FinancialTasks />
        </div>
      </div>
    </div>
  );
}
