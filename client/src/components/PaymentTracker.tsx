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
    <Card className="border">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">
          Payment Progress
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex justify-between mb-2">
            <span className="text-sm">Amount Paid</span>
            <span className="text-sm">${totalPaid.toLocaleString()} / ${loan.amount.toLocaleString()}</span>
          </div>
          <Progress value={progressPercentage} className="h-2" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 border rounded">
            <p className="text-xs text-gray-600">Remaining</p>
            <p className="font-semibold">${remainingBalance.toLocaleString()}</p>
          </div>
          <div className="p-3 border rounded">
            <p className="text-xs text-gray-600">Interest Rate</p>
            <p className="font-semibold">{loan.interestRate}%</p>
          </div>
        </div>

        {nextPaymentDue && (
          <div className="p-3 bg-blue-50 rounded border">
            <p className="text-sm font-medium">Next Payment Due</p>
            <p className="text-sm">
              ${parseFloat(nextPaymentDue.amount).toLocaleString()} on {nextPaymentDue.scheduledDate ? new Date(nextPaymentDue.scheduledDate).toLocaleDateString() : 'TBD'}
            </p>
          </div>
        )}

        {overduePayments > 0 && (
          <div className="p-3 bg-red-50 rounded border">
            <p className="text-sm font-medium text-red-800">Overdue Payments</p>
            <p className="text-sm text-red-700">
              {overduePayments} payment{overduePayments > 1 ? 's' : ''} overdue
            </p>
          </div>
        )}

        {isLender && onRecordPayment && (
          <Button onClick={onRecordPayment} className="w-full">
            Record Payment
          </Button>
        )}

        <div className="grid grid-cols-3 gap-4 pt-4 border-t">
          <div className="text-center">
            <p className="text-xs text-gray-600">Total Payments</p>
            <p className="font-semibold">
              {loan.payments?.filter(p => p.status === 'completed').length || 0}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-600">On Time</p>
            <p className="font-semibold">
              {loan.payments?.filter(p => 
                p.status === 'completed' && p.paidDate && p.scheduledDate &&
                new Date(p.paidDate) <= new Date(p.scheduledDate)
              ).length || 0}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-600">Interest</p>
            <p className="font-semibold">
              ${((totalPaid - parseFloat(loan.amount.toString())) > 0 ? (totalPaid - parseFloat(loan.amount.toString())) : 0).toLocaleString()}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}