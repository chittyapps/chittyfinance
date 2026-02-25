import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import type { LoanWithRelations } from "@shared/schema";

interface LoanTermsCardProps {
  loan: LoanWithRelations;
}

export default function LoanTermsCard({ loan }: LoanTermsCardProps) {
  const { user } = useAuth();
  const isLender = user?.id === loan.lenderId;
  const isBorrower = user?.id === loan.borrowerId;
  
  const formatCurrency = (amount: string | number) => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(numAmount);
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <Card className="bg-white border border-gray-200 shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-bold text-neutral-800 flex items-center gap-2">
            <i className="fas fa-file-contract text-primary"></i>
            {isLender ? "Your Loan Terms" : "Loan Agreement"}
          </CardTitle>
          <Badge variant={loan.status === 'active' ? 'default' : 'secondary'}>
            {loan.status}
          </Badge>
        </div>
        <p className="text-sm text-neutral-600">
          {isLender 
            ? `You are lending to ${loan.borrower.firstName || loan.borrower.email}`
            : `You are borrowing from ${loan.lender.firstName || loan.lender.email}`
          }
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Main Loan Details */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-gradient-to-br from-primary/5 to-primary/10 rounded-lg">
            <p className="text-xs text-neutral-500 mb-1">Loan Amount</p>
            <p className="text-2xl font-bold text-neutral-800">
              {formatCurrency(loan.amount)}
            </p>
          </div>
          <div className="p-4 bg-gradient-to-br from-green-500/5 to-green-500/10 rounded-lg">
            <p className="text-xs text-neutral-500 mb-1">Interest Rate</p>
            <p className="text-2xl font-bold text-green-600">
              {loan.interestRate}% APR
            </p>
          </div>
        </div>

        {/* Terms Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="font-semibold text-neutral-800 mb-2 flex items-center gap-1">
              <i className="fas fa-calendar text-primary text-sm"></i>
              Key Dates
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-600">Start Date:</span>
                <span className="font-medium">{formatDate(loan.createdAt || new Date())}</span>
              </div>
              {loan.dueDate && (
                <div className="flex justify-between">
                  <span className="text-neutral-600">Due Date:</span>
                  <span className="font-medium">{formatDate(loan.dueDate)}</span>
                </div>
              )}
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-neutral-800 mb-2 flex items-center gap-1">
              <i className="fas fa-info-circle text-primary text-sm"></i>
              Loan Purpose
            </h4>
            <p className="text-sm text-neutral-600">
              {loan.purpose || "General lending"}
            </p>
          </div>
        </div>

        {/* Payment Schedule */}
        <div>
          <h4 className="font-semibold text-neutral-800 mb-3 flex items-center gap-1">
            <i className="fas fa-clock text-primary text-sm"></i>
            Payment Schedule
          </h4>
          <div className="p-4 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-blue-600 font-medium">Payment Frequency</p>
                <p className="text-blue-800 capitalize">{loan.paymentFrequency || "Monthly"}</p>
              </div>
              <div>
                <p className="text-blue-600 font-medium">
                  {isLender ? "Expected Payment" : "Your Payment"}
                </p>
                <p className="text-blue-800 font-semibold">
                  {formatCurrency(parseFloat(loan.amount.toString()) * (1 + loan.interestRate / 100) / 12)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Simple Explanations */}
        <div className="border-t pt-4">
          <div className="p-4 bg-gradient-to-r from-amber-50 to-amber-100 rounded-lg">
            <div className="flex items-start gap-3">
              <i className="fas fa-lightbulb text-amber-600 text-lg mt-1"></i>
              <div>
                <h4 className="font-semibold text-amber-800 mb-1">
                  {isLender ? "How You Earn" : "What You Owe"}
                </h4>
                <p className="text-sm text-amber-700">
                  {isLender 
                    ? `You'll earn ${loan.interestRate}% interest on your ${formatCurrency(loan.amount)} loan. That's approximately ${formatCurrency(parseFloat(loan.amount.toString()) * loan.interestRate / 100)} in interest over the year.`
                    : `You borrowed ${formatCurrency(loan.amount)} at ${loan.interestRate}% interest. Your total repayment will be approximately ${formatCurrency(parseFloat(loan.amount.toString()) * (1 + loan.interestRate / 100))}.`
                  }
                </p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}