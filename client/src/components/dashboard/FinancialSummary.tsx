import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CircleDollarSign, TrendingUp, FileText, TrendingDown } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { FinancialSummary as FinancialSummaryType } from "@shared/schema";

interface FinancialSummaryProps {
  data?: FinancialSummaryType;
  isLoading: boolean;
}

export default function FinancialSummary({ data, isLoading }: FinancialSummaryProps) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {/* Cash on Hand Card */}
      <Card className="card">
        <CardContent className="p-5">
          {isLoading ? (
            <SummaryCardSkeleton />
          ) : (
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-zinc-800 rounded-md p-3 border border-lime-500/20">
                <CircleDollarSign className="h-6 w-6 text-lime-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-zinc-400 truncate">
                    Cash on Hand
                  </dt>
                  <dd className="flex items-baseline">
                    <div className="text-2xl font-bold text-zinc-100 font-mono gradient-text">
                      {data ? formatCurrency(data.cashOnHand) : "$0.00"}
                    </div>
                  </dd>
                </dl>
              </div>
            </div>
          )}
        </CardContent>
        <div className="bg-zinc-800 border-t border-zinc-700 px-5 py-3">
          <div className="text-sm">
            <a href="#" className="font-medium text-lime-400 hover:text-lime-300 transition-colors">
              View details →
            </a>
          </div>
        </div>
      </Card>

      {/* Monthly Revenue Card */}
      <Card className="card">
        <CardContent className="p-5">
          {isLoading ? (
            <SummaryCardSkeleton />
          ) : (
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-zinc-800 rounded-md p-3 border border-lime-500/20">
                <TrendingUp className="h-6 w-6 text-lime-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-zinc-400 truncate">
                    Monthly Revenue
                  </dt>
                  <dd className="flex items-baseline">
                    <div className="text-2xl font-bold text-zinc-100 font-mono gradient-text">
                      {data ? formatCurrency(data.monthlyRevenue) : "$0.00"}
                    </div>
                    <span className="ml-2 text-sm font-medium text-lime-500">+5.2%</span>
                  </dd>
                </dl>
              </div>
            </div>
          )}
        </CardContent>
        <div className="bg-zinc-800 border-t border-zinc-700 px-5 py-3">
          <div className="text-sm">
            <a href="#" className="font-medium text-lime-400 hover:text-lime-300 transition-colors">
              View details →
            </a>
          </div>
        </div>
      </Card>

      {/* Outstanding Invoices Card */}
      <Card className="card">
        <CardContent className="p-5">
          {isLoading ? (
            <SummaryCardSkeleton />
          ) : (
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-zinc-800 rounded-md p-3 border border-lime-500/20">
                <FileText className="h-6 w-6 text-lime-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-zinc-400 truncate">
                    Outstanding Invoices
                  </dt>
                  <dd className="flex items-baseline">
                    <div className="text-2xl font-bold text-zinc-100 font-mono gradient-text">
                      {data ? formatCurrency(data.outstandingInvoices) : "$0.00"}
                    </div>
                  </dd>
                </dl>
              </div>
            </div>
          )}
        </CardContent>
        <div className="bg-zinc-800 border-t border-zinc-700 px-5 py-3">
          <div className="text-sm">
            <a href="#" className="font-medium text-lime-400 hover:text-lime-300 transition-colors">
              View details →
            </a>
          </div>
        </div>
      </Card>

      {/* Monthly Expenses Card */}
      <Card className="card">
        <CardContent className="p-5">
          {isLoading ? (
            <SummaryCardSkeleton />
          ) : (
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-zinc-800 rounded-md p-3 border border-lime-500/20">
                <TrendingDown className="h-6 w-6 text-lime-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-zinc-400 truncate">
                    Monthly Expenses
                  </dt>
                  <dd className="flex items-baseline">
                    <div className="text-2xl font-bold text-zinc-100 font-mono gradient-text">
                      {data ? formatCurrency(data.monthlyExpenses) : "$0.00"}
                    </div>
                    <span className="ml-2 text-sm font-medium text-red-400">+2.8%</span>
                  </dd>
                </dl>
              </div>
            </div>
          )}
        </CardContent>
        <div className="bg-zinc-800 border-t border-zinc-700 px-5 py-3">
          <div className="text-sm">
            <a href="#" className="font-medium text-lime-400 hover:text-lime-300 transition-colors">
              View details →
            </a>
          </div>
        </div>
      </Card>
    </div>
  );
}

function SummaryCardSkeleton() {
  return (
    <div className="flex items-center">
      <Skeleton className="h-12 w-12 rounded-md bg-zinc-800" />
      <div className="ml-5 w-0 flex-1">
        <Skeleton className="h-4 w-20 mb-2 bg-zinc-800" />
        <Skeleton className="h-6 w-24 bg-zinc-800" />
      </div>
    </div>
  );
}
