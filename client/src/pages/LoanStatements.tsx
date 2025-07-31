import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "wouter";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { FileTextIcon, DownloadIcon, CalendarIcon, DollarSignIcon, TrendingUpIcon } from "lucide-react";
import { Statement } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useDynamicTerms } from "@/hooks/useDynamicTerms";

interface StatementCardProps {
  statement: Statement;
}

function StatementCard({ statement }: StatementCardProps) {
  const startDate = new Date(statement.statementPeriodStart);
  const endDate = new Date(statement.statementPeriodEnd);
  const beginningBalance = parseFloat(statement.beginningBalance);
  const endingBalance = parseFloat(statement.endingBalance);
  const paymentsReceived = parseFloat(statement.totalPaymentsReceived);
  const interestAccrued = parseFloat(statement.totalInterestAccrued);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "generated": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
      case "sent": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
      case "viewed": return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300";
      default: return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300";
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">
            Statement Period
          </CardTitle>
          <Badge className={getStatusColor(statement.status)}>
            {statement.status}
          </Badge>
        </div>
        <CardDescription>
          {formatDate(startDate)} - {formatDate(endDate)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Financial Summary */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Beginning Balance</p>
            <p className="text-lg font-semibold">{formatCurrency(beginningBalance)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Ending Balance</p>
            <p className="text-lg font-semibold">{formatCurrency(endingBalance)}</p>
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Payments Received</p>
            <p className="text-sm font-semibold text-green-600">{formatCurrency(paymentsReceived)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Interest Accrued</p>
            <p className="text-sm font-semibold text-blue-600">{formatCurrency(interestAccrued)}</p>
          </div>
        </div>

        {/* Payment Statistics */}
        <div className="bg-muted/50 rounded-lg p-3 space-y-2">
          <h4 className="text-sm font-medium">Payment Activity</h4>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <p className="text-muted-foreground">On-time</p>
              <p className="font-semibold text-green-600">{statement.onTimePayments}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Late</p>
              <p className="font-semibold text-orange-600">{statement.latePayments}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Missed</p>
              <p className="font-semibold text-red-600">{statement.missedPayments}</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <DownloadIcon className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
          <Button variant="outline" size="sm">
            Email Statement
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function LoanStatements() {
  const params = useParams();
  const loanId = params.id as string;
  const queryClient = useQueryClient();
  const { creditor, debtor } = useDynamicTerms();

  // Fetch loan statements
  const { data: statements, isLoading, error } = useQuery<Statement[]>({
    queryKey: ["/api/statements", loanId],
    enabled: !!loanId,
  });

  // Generate new statement mutation
  const generateStatementMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/statements/generate/${loanId}`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/statements", loanId] });
    },
  });

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-64 bg-gray-200 dark:bg-gray-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Alert>
          <AlertDescription>
            Failed to load statements. Please try again later.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">30-Day Statements</h1>
          <p className="text-muted-foreground">
            Automated periodic statements for comprehensive loan tracking
          </p>
        </div>
        <Button 
          onClick={() => generateStatementMutation.mutate()}
          disabled={generateStatementMutation.isPending}
        >
          <FileTextIcon className="h-4 w-4 mr-2" />
          {generateStatementMutation.isPending ? "Generating..." : "Generate New Statement"}
        </Button>
      </div>

      {/* Legal Notice */}
      <Alert className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
        <FileTextIcon className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-800 dark:text-blue-200">
          <strong>Automated Statements:</strong> Statements are automatically generated every 30 days 
          for active loans. These provide comprehensive tracking for tax purposes and loan management. 
          We are not a bank - these are informal tracking documents.
        </AlertDescription>
      </Alert>

      {/* Summary Stats */}
      {statements && statements.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <CalendarIcon className="h-4 w-4" />
                Total Statements
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statements.length}</div>
              <p className="text-xs text-muted-foreground">Since loan creation</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <DollarSignIcon className="h-4 w-4" />
                Total Payments
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(
                  statements.reduce((sum, s) => sum + parseFloat(s.totalPaymentsReceived), 0)
                )}
              </div>
              <p className="text-xs text-muted-foreground">Across all periods</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUpIcon className="h-4 w-4" />
                Payment Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {statements.length > 0 ? 
                  Math.round(
                    (statements.reduce((sum, s) => sum + (s.onTimePayments || 0), 0) / 
                     Math.max(statements.reduce((sum, s) => sum + (s.numberOfPayments || 0), 0), 1)) * 100
                  ) : 0
                }%
              </div>
              <p className="text-xs text-muted-foreground">On-time rate</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Statements List */}
      {statements && statements.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {statements.map((statement) => (
            <StatementCard key={statement.id} statement={statement} />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <FileTextIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Statements Yet</h3>
            <p className="text-muted-foreground mb-4">
              Statements are automatically generated every 30 days for active loans.
            </p>
            <Button 
              onClick={() => generateStatementMutation.mutate()}
              disabled={generateStatementMutation.isPending}
            >
              Generate First Statement
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Premium Features */}
      <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/50">
        <CardHeader>
          <CardTitle className="text-amber-800 dark:text-amber-200">
            Premium Statement Features
          </CardTitle>
        </CardHeader>
        <CardContent className="text-amber-700 dark:text-amber-300">
          <ul className="space-y-2 text-sm">
            <li>• Certified mail delivery to {debtor.toLowerCase()}s</li>
            <li>• AI-generated payment notices and reminders</li>
            <li>• Official loan registration and documentation</li>
            <li>• Professional PDF formatting and branding</li>
            <li>• Automated tax form generation (1099-INT)</li>
          </ul>
          <Button className="mt-4" variant="outline">
            Upgrade to Premium
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}