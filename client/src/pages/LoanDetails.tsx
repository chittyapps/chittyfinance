import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import Timeline from "@/components/Timeline";
import PaymentTracker from "@/components/PaymentTracker";
import QuickPaymentForm from "@/components/QuickPaymentForm";
import LoanTermsCard from "@/components/LoanTermsCard";
import SimplePaymentHistory from "@/components/SimplePaymentHistory";
import type { LoanWithRelations } from "@shared/schema";

export default function LoanDetails() {
  const { id } = useParams<{ id: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showMessageForm, setShowMessageForm] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [messageText, setMessageText] = useState("");

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [user, authLoading, toast]);

  const { data: loan, isLoading, error } = useQuery<LoanWithRelations>({
    queryKey: ["/api/loans", id],
    enabled: !!user && !!id,
    retry: false,
  });

  // Handle unauthorized errors
  useEffect(() => {
    if (error && isUnauthorizedError(error as Error)) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [error, toast]);

  // Payment mutation
  const paymentMutation = useMutation({
    mutationFn: async (data: { amount: number; loanId: string }) => {
      const payment = {
        loanId: data.loanId,
        amount: data.amount.toString(),
        scheduledDate: new Date().toISOString(),
        principalAmount: (data.amount * 0.8).toString(), // Simplified calculation
        interestAmount: (data.amount * 0.2).toString(),
        status: 'completed' as const,
      };
      
      await apiRequest("POST", "/api/payments", payment);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/loans", id] });
      toast({
        title: "Payment Recorded",
        description: "Payment has been successfully recorded.",
      });
      setShowPaymentForm(false);
      setPaymentAmount("");
    },
    onError: (error) => {
      if (isUnauthorizedError(error as Error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to record payment. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Message mutation
  const messageMutation = useMutation({
    mutationFn: async (data: { message: string; loanId: string; receiverId: string }) => {
      const communication = {
        loanId: data.loanId,
        receiverId: data.receiverId,
        message: data.message,
        subject: "Loan Discussion",
      };
      
      await apiRequest("POST", "/api/communications", communication);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/loans", id] });
      toast({
        title: "Message Sent",
        description: "Your message has been sent successfully.",
      });
      setShowMessageForm(false);
      setMessageText("");
    },
    onError: (error) => {
      if (isUnauthorizedError(error as Error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handlePayment = () => {
    if (!paymentAmount || !loan) return;
    
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid payment amount.",
        variant: "destructive",
      });
      return;
    }

    paymentMutation.mutate({ amount, loanId: loan.id });
  };

  const handleSendMessage = () => {
    if (!messageText || !loan || !user) return;

    const receiverId = loan.lenderId === user.id ? loan.borrowerId : loan.lenderId;
    messageMutation.mutate({ 
      message: messageText, 
      loanId: loan.id, 
      receiverId 
    });
  };

  const formatCurrency = (amount: string | number) => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(numAmount);
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-neutral-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <nav className="glass-morphism fixed top-0 left-0 right-0 z-50 px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <Button 
              variant="ghost" 
              onClick={() => setLocation("/")}
              className="text-neutral-600 hover:text-primary"
            >
              <i className="fas fa-arrow-left mr-2"></i>Back to Dashboard
            </Button>
          </div>
        </nav>
        
        <div className="pt-20 pb-16 px-4">
          <div className="max-w-7xl mx-auto">
            <div className="animate-pulse space-y-6">
              <div className="h-8 bg-neutral-200 rounded w-1/3"></div>
              <div className="h-64 bg-neutral-200 rounded"></div>
              <div className="h-96 bg-neutral-200 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!loan) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <i className="fas fa-exclamation-triangle text-4xl text-red-400 mb-4"></i>
          <h1 className="text-2xl font-bold text-neutral-800 mb-2">Loan Not Found</h1>
          <p className="text-neutral-600 mb-4">The loan you're looking for doesn't exist or you don't have access to it.</p>
          <Button onClick={() => setLocation("/")} className="hero-gradient text-white">
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const isLender = loan.lenderId === user.id;
  const otherParty = isLender ? loan.borrower : loan.lender;

  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="glass-morphism fixed top-0 left-0 right-0 z-50 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Button 
            variant="ghost" 
            onClick={() => setLocation("/")}
            className="text-neutral-600 hover:text-primary"
          >
            <i className="fas fa-arrow-left mr-2"></i>Back to Dashboard
          </Button>
          
          <div className="flex items-center space-x-3">
            <Button 
              onClick={() => setShowMessageForm(!showMessageForm)}
              variant="outline"
              className="border-neutral-200"
            >
              <i className="fas fa-comment mr-2"></i>Message
            </Button>
            {isLender && (
              <Button 
                onClick={() => setShowPaymentForm(!showPaymentForm)}
                className="hero-gradient text-white"
              >
                <i className="fas fa-dollar-sign mr-2"></i>Record Payment
              </Button>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="pt-20 pb-16 px-4">
        <div className="max-w-7xl mx-auto">
          
          {/* Payment Tracking */}
          <div className="mb-8">
            <PaymentTracker 
              loan={loan} 
              onRecordPayment={() => setShowPaymentForm(true)} 
            />
          </div>

          {/* Quick Payment Form */}
          {showPaymentForm && (
            <div className="mb-8">
              <QuickPaymentForm
                loanId={loan.id}
                onSuccess={() => {
                  setShowPaymentForm(false);
                  queryClient.invalidateQueries({ queryKey: ["/api/loans", id] });
                }}
                onCancel={() => setShowPaymentForm(false)}
              />
            </div>
          )}
          
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-neutral-800 mb-2">
              {loan.purpose || 'Loan'} - {formatCurrency(loan.amount)}
            </h1>
            <p className="text-lg text-neutral-600">
              {isLender ? `Lending to ${otherParty.firstName || otherParty.email}` : `Borrowing from ${otherParty.firstName || otherParty.email}`}
            </p>
          </div>

          {/* Basic Loan Info */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white p-4 rounded-lg border">
              <p className="text-sm text-neutral-600">Amount</p>
              <p className="text-xl font-bold text-neutral-800">{formatCurrency(loan.amount)}</p>
            </div>
            <div className="bg-white p-4 rounded-lg border">
              <p className="text-sm text-neutral-600">Interest Rate</p>
              <p className="text-xl font-bold text-neutral-800">{loan.interestRate}%</p>
            </div>
            <div className="bg-white p-4 rounded-lg border">
              <p className="text-sm text-neutral-600">Status</p>
              <p className="text-xl font-bold text-neutral-800 capitalize">{loan.status}</p>
            </div>
            <div className="bg-white p-4 rounded-lg border">
              <p className="text-sm text-neutral-600">Created</p>
              <p className="text-xl font-bold text-neutral-800">
                {new Date(loan.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          {(showPaymentForm || showMessageForm) && (
            <Card className="loan-card mb-8">
              <CardHeader>
                <CardTitle>
                  {showPaymentForm ? 'Record Payment' : 'Send Message'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {showPaymentForm && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-2">
                        Payment Amount
                      </label>
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                        className="w-full"
                      />
                    </div>
                    <div className="flex space-x-3">
                      <Button 
                        onClick={handlePayment}
                        disabled={paymentMutation.isPending}
                        className="hero-gradient text-white"
                      >
                        {paymentMutation.isPending ? 'Recording...' : 'Record Payment'}
                      </Button>
                      <Button 
                        variant="outline"
                        onClick={() => setShowPaymentForm(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {showMessageForm && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-2">
                        Message to {otherParty.firstName || otherParty.email}
                      </label>
                      <Textarea
                        placeholder="Type your message here..."
                        value={messageText}
                        onChange={(e) => setMessageText(e.target.value)}
                        rows={4}
                        className="w-full"
                      />
                    </div>
                    <div className="flex space-x-3">
                      <Button 
                        onClick={handleSendMessage}
                        disabled={messageMutation.isPending}
                        className="hero-gradient text-white"
                      >
                        {messageMutation.isPending ? 'Sending...' : 'Send Message'}
                      </Button>
                      <Button 
                        variant="outline"
                        onClick={() => setShowMessageForm(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Timeline */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-neutral-800 mb-6">Loan Timeline</h2>
            <Timeline loanId={loan.id} />
          </div>
        </div>
      </div>
    </div>
  );
}
