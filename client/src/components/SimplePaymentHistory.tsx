import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import type { LoanWithRelations } from "@shared/schema";

interface SimplePaymentHistoryProps {
  loan: LoanWithRelations;
}

export default function SimplePaymentHistory({ loan }: SimplePaymentHistoryProps) {
  const { user } = useAuth();
  const isLender = user?.id === loan.lenderId;

  const formatCurrency = (amount: string | number) => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(numAmount);
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return 'Not set';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'late':
        return 'bg-red-100 text-red-800';
      case 'missed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return 'fas fa-check-circle text-green-500';
      case 'pending':
        return 'fas fa-clock text-yellow-500';
      case 'late':
        return 'fas fa-exclamation-triangle text-red-500';
      case 'missed':
        return 'fas fa-times-circle text-red-500';
      default:
        return 'fas fa-question-circle text-gray-500';
    }
  };

  const sortedPayments = loan.payments?.sort((a, b) => {
    const dateA = new Date(a.scheduledDate || a.createdAt || new Date());
    const dateB = new Date(b.scheduledDate || b.createdAt || new Date());
    return dateB.getTime() - dateA.getTime(); // Most recent first
  }) || [];

  return (
    <Card className="glass-morphism border-0 shadow-xl">
      <CardHeader>
        <CardTitle className="text-xl font-bold text-neutral-800 flex items-center gap-2">
          <i className="fas fa-history text-primary"></i>
          Payment History
        </CardTitle>
        <p className="text-sm text-neutral-600">
          {isLender 
            ? "Track all payments received for this loan" 
            : "Your payment history and upcoming payments"
          }
        </p>
      </CardHeader>
      <CardContent>
        {sortedPayments.length === 0 ? (
          <div className="text-center py-8">
            <i className="fas fa-inbox text-4xl text-neutral-300 mb-4"></i>
            <p className="text-neutral-500">No payments recorded yet</p>
            <p className="text-sm text-neutral-400">
              {isLender 
                ? "Payments will appear here as you record them"
                : "Your payments will be tracked here automatically"
              }
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedPayments.map((payment, index) => (
              <div key={payment.id} className="flex items-center justify-between p-4 bg-white/50 rounded-lg border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-r from-primary/10 to-primary/20 flex items-center justify-center">
                    <i className={`${getStatusIcon(payment.status)} text-lg`}></i>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-neutral-800">
                        {formatCurrency(payment.amount)}
                      </p>
                      <Badge className={getStatusColor(payment.status)}>
                        {payment.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-neutral-600">
                      {payment.status === 'completed' && payment.paidDate ? (
                        <span>Paid: {formatDate(payment.paidDate)}</span>
                      ) : (
                        <span>Due: {formatDate(payment.scheduledDate)}</span>
                      )}
                      {payment.notes && payment.notes.includes('via') && (
                        <span className="flex items-center gap-1">
                          <i className="fas fa-credit-card text-xs"></i>
                          {payment.notes.split('via')[1]?.trim() || 'Payment method'}
                        </span>
                      )}
                    </div>
                    {payment.notes && (
                      <p className="text-xs text-neutral-500 mt-1 italic">
                        "{payment.notes}"
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="text-sm text-neutral-600">
                    {isLender ? "Received" : "Payment"} #{sortedPayments.length - index}
                  </div>
                  {payment.status === 'completed' && (
                    <div className="text-xs text-green-600 flex items-center gap-1">
                      <i className="fas fa-check"></i>
                      Confirmed
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {sortedPayments.length > 0 && (
          <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-blue-600">Total Payments</p>
                <p className="font-semibold text-blue-800">
                  {sortedPayments.filter(p => p.status === 'completed').length}
                </p>
              </div>
              <div>
                <p className="text-xs text-blue-600">On Schedule</p>
                <p className="font-semibold text-blue-800">
                  {sortedPayments.filter(p => 
                    p.status === 'completed' && p.paidDate && p.scheduledDate &&
                    new Date(p.paidDate) <= new Date(p.scheduledDate)
                  ).length}
                </p>
              </div>
              <div>
                <p className="text-xs text-blue-600">Late/Missed</p>
                <p className="font-semibold text-red-600">
                  {sortedPayments.filter(p => 
                    p.status === 'late' || p.status === 'missed'
                  ).length}
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}