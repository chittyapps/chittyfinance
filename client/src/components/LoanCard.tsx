import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import type { LoanWithRelations } from "@shared/schema";

interface LoanCardProps {
  loan: LoanWithRelations;
}

export default function LoanCard({ loan }: LoanCardProps) {
  const [, setLocation] = useLocation();

  const handleViewDetails = () => {
    setLocation(`/loans/${loan.id}`);
  };

  const formatCurrency = (amount: string | number) => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(numAmount);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-emerald-100 text-emerald-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'completed':
        return 'bg-blue-100 text-blue-800';
      case 'defaulted':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-neutral-100 text-neutral-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return 'fa-clock';
      case 'pending':
        return 'fa-hourglass-half';
      case 'completed':
        return 'fa-check-circle';
      case 'defaulted':
        return 'fa-exclamation-triangle';
      default:
        return 'fa-question-circle';
    }
  };

  return (
    <Card className="hover:shadow-lg transition-all duration-200 border-0 bg-white/50 backdrop-blur-sm">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-neutral-800 mb-1">
              {loan.borrower.firstName || loan.borrower.email}'s {loan.purpose || 'Loan'}
            </h3>
            <p className="text-sm text-neutral-600">
              {formatCurrency(loan.amount)} • {loan.termMonths} months • {loan.interestRate}% APR
            </p>
          </div>
          <div className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(loan.status)}`}>
            <i className={`fas ${getStatusIcon(loan.status)} mr-1`}></i>
            {loan.status.charAt(0).toUpperCase() + loan.status.slice(1)}
          </div>
        </div>

        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-neutral-600">Remaining Balance</span>
            <span className="font-medium text-neutral-800">
              {formatCurrency(loan.remainingBalance)}
            </span>
          </div>
          {loan.nextPaymentDate && (
            <div className="flex justify-between text-sm">
              <span className="text-neutral-600">Next Payment</span>
              <span className="font-medium text-neutral-800">
                {new Date(loan.nextPaymentDate).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>

        <Button 
          onClick={handleViewDetails}
          variant="outline"
          className="w-full border-neutral-200 hover:bg-neutral-50"
        >
          View Details
        </Button>
      </CardContent>
    </Card>
  );
}
