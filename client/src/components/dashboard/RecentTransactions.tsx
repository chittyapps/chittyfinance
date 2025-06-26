import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingDown, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Transaction } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";

export default function RecentTransactions() {
  const { data: transactions, isLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions", { limit: 3 }],
  });

  return (
    <Card className="overflow-hidden">
      <CardHeader className="px-6 py-5 border-b border-gray-200 dark:border-gray-700">
        <CardTitle className="text-lg font-medium">Recent Transactions</CardTitle>
      </CardHeader>
      
      <CardContent className="px-6 py-5">
        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
          {isLoading ? (
            // Skeleton loading state
            <>
              <TransactionItemSkeleton />
              <TransactionItemSkeleton />
              <TransactionItemSkeleton />
            </>
          ) : transactions && transactions.length > 0 ? (
            // Map over transactions
            transactions.map((transaction) => (
              <TransactionItem 
                key={transaction.id} 
                transaction={transaction} 
              />
            ))
          ) : (
            // Empty state
            <li className="py-4 text-center text-gray-500 dark:text-gray-400">
              No recent transactions
            </li>
          )}
        </ul>
        
        <div className="mt-6">
          <Button 
            variant="outline" 
            className="w-full border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
          >
            View All Transactions
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface TransactionItemProps {
  transaction: Transaction;
}

function TransactionItem({ transaction }: TransactionItemProps) {
  const isIncome = transaction.amount > 0;

  return (
    <li className="py-4">
      <div className="flex items-center space-x-4">
        <div className="flex-shrink-0">
          <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-gray-100 dark:bg-gray-700">
            {isIncome ? (
              <TrendingUp className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            ) : (
              <TrendingDown className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            )}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {transaction.title}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
            {transaction.description}
          </p>
        </div>
        <div>
          <div className={`inline-flex items-center text-base font-semibold font-mono ${
            isIncome ? 'text-green-500' : 'text-red-500'
          }`}>
            {formatCurrency(transaction.amount)}
          </div>
        </div>
      </div>
    </li>
  );
}

function TransactionItemSkeleton() {
  return (
    <li className="py-4">
      <div className="flex items-center space-x-4">
        <Skeleton className="h-8 w-8 rounded-full" />
        <div className="flex-1 min-w-0">
          <Skeleton className="h-4 w-3/4 mb-2" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <Skeleton className="h-5 w-24" />
      </div>
    </li>
  );
}
