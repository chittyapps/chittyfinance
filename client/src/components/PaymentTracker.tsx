import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/useAuth";
import type { LoanWithRelations } from "@shared/schema";

interface PaymentTrackerProps {
  loan: LoanWithRelations;
  onRecordPayment?: () => void;
}

export default function PaymentTracker({ loan, onRecordPayment }: PaymentTrackerProps) {
  const { user } = useAuth();
  const isLender = user?.id === loan.lenderId;
  const isBorrower = user?.id === loan.borrowerId;
  
  const totalPaid = loan.payments?.reduce((sum, payment) => 
    payment.status === 'completed' ? sum + parseFloat(payment.amount) : sum, 0) || 0;
  const remainingBalance = parseFloat(loan.amount.toString()) - totalPaid;
  const progressPercentage = (totalPaid / parseFloat(loan.amount.toString())) * 100;
  
  const nextPaymentDue = loan.payments?.find(payment => 
    payment.status === 'pending' && payment.scheduledDate && new Date(payment.scheduledDate) > new Date()
  );
  
  const overduePayments = loan.payments?.filter(payment => 
    payment.status === 'pending' && payment.scheduledDate && new Date(payment.scheduledDate) < new Date()
  ).length || 0;

  return (
    <Card className="glass-morphism border-0 shadow-xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-bold text-neutral-800 flex items-center gap-2">
            <i className="fas fa-chart-line text-primary"></i>
            {isLender ? "Your Investment Progress" : "Your Loan Progress"}
          </CardTitle>
          <Badge variant={loan.status === 'active' ? 'default' : 'secondary'}>
            {loan.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Payment Progress */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-neutral-600">
              {isLender ? "Amount Received" : "Amount Paid"}
            </span>
            <span className="text-sm text-neutral-500">
              ${totalPaid.toLocaleString()} / ${loan.amount.toLocaleString()}
            </span>
          </div>
          <Progress value={progressPercentage} className="h-3" />
          <p className="text-xs text-neutral-500 mt-1">
            {progressPercentage.toFixed(1)}% complete
          </p>
        </div>

        {/* Key Numbers */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-gradient-to-br from-primary/5 to-primary/10 rounded-lg">
            <p className="text-xs text-neutral-500 mb-1">Remaining Balance</p>
            <p className="text-lg font-bold text-neutral-800">
              ${remainingBalance.toLocaleString()}
            </p>
          </div>
          <div className="p-3 bg-gradient-to-br from-green-500/5 to-green-500/10 rounded-lg">
            <p className="text-xs text-neutral-500 mb-1">Interest Rate</p>
            <p className="text-lg font-bold text-green-600">
              {loan.interestRate}% APR
            </p>
          </div>
        </div>

        {/* Next Payment Info */}
        {nextPaymentDue && (
          <div className="p-4 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <i className="fas fa-calendar text-blue-600"></i>
              <h4 className="font-semibold text-blue-800">Next Payment Due</h4>
            </div>
            <p className="text-blue-700 font-medium">
              ${parseFloat(nextPaymentDue.amount).toLocaleString()} on {nextPaymentDue.scheduledDate ? new Date(nextPaymentDue.scheduledDate).toLocaleDateString() : 'TBD'}
            </p>
          </div>
        )}

        {/* Overdue Alerts */}
        {overduePayments > 0 && (
          <div className="p-4 bg-gradient-to-r from-red-50 to-red-100 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <i className="fas fa-exclamation-triangle text-red-600"></i>
              <h4 className="font-semibold text-red-800">Overdue Payments</h4>
            </div>
            <p className="text-red-700">
              {overduePayments} payment{overduePayments > 1 ? 's' : ''} overdue
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          {isLender && (
            <>
              <Button 
                onClick={onRecordPayment}
                className="flex-1 bg-gradient-to-r from-green-500 to-green-600 text-white"
              >
                <i className="fas fa-check mr-2"></i>
                Record Payment Received
              </Button>
            </>
          )}
          {isBorrower && nextPaymentDue && (
            <Button 
              className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white"
            >
              <i className="fas fa-credit-card mr-2"></i>
              Make Payment
            </Button>
          )}
          <Button variant="outline" className="flex-1">
            <i className="fas fa-history mr-2"></i>
            Payment History
          </Button>
        </div>

        {/* Quick Stats */}
        <div className="border-t pt-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-neutral-500">Total Payments</p>
              <p className="font-semibold text-neutral-800">
                {loan.payments?.filter(p => p.status === 'completed').length || 0}
              </p>
            </div>
            <div>
              <p className="text-xs text-neutral-500">On Time</p>
              <p className="font-semibold text-green-600">
                {loan.payments?.filter(p => 
                  p.status === 'completed' && p.paidDate && p.scheduledDate &&
                  new Date(p.paidDate) <= new Date(p.scheduledDate)
                ).length || 0}
              </p>
            </div>
            <div>
              <p className="text-xs text-neutral-500">
                {isLender ? "Interest Earned" : "Interest Paid"}
              </p>
              <p className="font-semibold text-primary">
                ${((totalPaid - parseFloat(loan.amount.toString())) > 0 ? (totalPaid - parseFloat(loan.amount.toString())) : 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}