import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useSeasonalTheme } from "@/hooks/useSeasonalTheme";
import { useDynamicTerms } from "@/hooks/useDynamicTerms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DashboardStats from "@/components/DashboardStats";
import LoanCard from "@/components/LoanCard";
import BankingGuide from "@/components/BankingGuide";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";
import { isUnauthorizedError } from "@/lib/authUtils";
import type { LoanWithRelations } from "@shared/schema";

export default function Dashboard() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const seasonalTheme = useSeasonalTheme();
  const terms = useDynamicTerms();

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

  const { data: loans, isLoading: loansLoading, error } = useQuery<LoanWithRelations[]>({
    queryKey: ["/api/loans"],
    enabled: !!user,
    retry: false,
  });

  const { data: stats, isLoading: statsLoading } = useQuery<{
    totalLent: number;
    activeLoans: number;
    avgInterestRate: number;
    onTimeRate: number;
  }>({
    queryKey: ["/api/dashboard/stats"],
    enabled: !!user,
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

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  const handleCreateLoan = () => {
    setLocation("/create-loan");
  };

  const recentLoans = loans?.slice(0, 3) || [];
  const recentActivity = loans?.flatMap(loan => 
    loan.timelineEvents?.slice(0, 2).map(event => ({
      ...event,
      loanTitle: `${loan.borrower.firstName || loan.borrower.email}'s ${loan.purpose || 'Loan'}`,
    })) || []
  ).slice(0, 5) || [];

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

  return (
    <div className={`min-h-screen bg-gradient-to-br ${seasonalTheme.backgroundColor}`}>
      {/* Navigation */}
      <nav className="glass-morphism fixed top-0 left-0 right-0 z-50 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`w-8 h-8 bg-gradient-to-r ${seasonalTheme.gradientFrom} ${seasonalTheme.gradientTo} rounded-lg flex items-center justify-center`}>
              <i className="fas fa-handshake text-white text-sm"></i>
            </div>
            <span className="text-xl font-bold text-neutral-800">Close Lender</span>
          </div>
          
          <div className="hidden md:flex items-center space-x-6">
            <button 
              onClick={() => setLocation("/")}
              className="text-primary font-medium transition-colors"
            >
              Dashboard
            </button>
            <button 
              onClick={() => setLocation("/community")}
              className="text-neutral-600 hover:text-primary transition-colors"
            >
              Community
            </button>
            <button 
              onClick={() => setLocation("/ai-document-processor")}
              className="text-neutral-600 hover:text-primary transition-colors"
            >
              AI Processor
            </button>
            <button 
              onClick={() => setLocation("/timeline-export")}
              className="text-neutral-600 hover:text-primary transition-colors"
            >
              Legal Timeline
            </button>
            <button 
              onClick={() => setLocation("/settings")}
              className="text-neutral-600 hover:text-primary transition-colors"
            >
              Settings
            </button>
          </div>

          <div className="flex items-center space-x-3">
            <Button
              onClick={handleCreateLoan}
              className={`bg-gradient-to-r ${seasonalTheme.gradientFrom} ${seasonalTheme.gradientTo} text-white hover:shadow-lg transform hover:scale-105 transition-all duration-300`}
            >
              <i className="fas fa-university mr-2"></i>
              Start Lending
            </Button>
            <button className="p-2 rounded-lg hover:bg-white hover:bg-opacity-20 transition-all">
              <i className="fas fa-bell text-neutral-600"></i>
            </button>
            <button 
              onClick={handleLogout}
              className="w-8 h-8 rounded-full bg-gradient-to-r from-secondary to-primary flex items-center justify-center"
            >
              <i className="fas fa-user text-white text-sm"></i>
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="pt-20 pb-16 px-4">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-neutral-800 mb-2">
              Your Personal Bank
            </h1>
            <div className="flex items-center gap-2">
              <p className="text-xl text-neutral-600">Welcome back, {user.firstName || user.username}! Lend money, earn interest, build wealth</p>
              <span dangerouslySetInnerHTML={{ __html: seasonalTheme.treeStage }}></span>
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-sm text-neutral-500">
              <span className="flex items-center gap-1">
                <i className="fas fa-university text-primary"></i>
                Banking made simple
              </span>
              <span className="flex items-center gap-1">
                <i className="fas fa-users text-primary"></i>
                Peer-to-peer lending
              </span>
              <span className="flex items-center gap-1">
                <i className="fas fa-chart-line text-primary"></i>
                Earn while helping others
              </span>
            </div>
          </div>

          {/* Banking Guide for New Users */}
          {(!loans || loans.length === 0) && (
            <div className="mb-8">
              <BankingGuide />
            </div>
          )}

          {/* Dashboard Stats */}
          <DashboardStats stats={stats} isLoading={statsLoading} />

          {/* Recent Loans and Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {/* Recent Loans */}
            <Card className="loan-card">
              <CardHeader>
                <CardTitle className="text-2xl font-bold text-neutral-800">Recent {terms.creditor} Activity</CardTitle>
              </CardHeader>
              <CardContent>
                {loansLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="animate-pulse">
                        <div className="h-20 bg-neutral-200 rounded-lg"></div>
                      </div>
                    ))}
                  </div>
                ) : recentLoans.length > 0 ? (
                  <div className="space-y-4">
                    {recentLoans.map(loan => (
                      <LoanCard key={loan.id} loan={loan} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <i className="fas fa-university text-4xl text-neutral-400 mb-4"></i>
                    <p className="text-neutral-600 mb-4">Ready to be your own bank?</p>
                    <p className="text-sm text-neutral-500 mb-4">Start lending money to friends and family, earn interest, and help them achieve their goals</p>
                    <Button onClick={handleCreateLoan} className="hero-gradient text-white">
                      Start Your Banking Journey
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card className="loan-card">
              <CardHeader>
                <CardTitle className="text-2xl font-bold text-neutral-800">Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                {loansLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="animate-pulse">
                        <div className="h-16 bg-neutral-200 rounded-lg"></div>
                      </div>
                    ))}
                  </div>
                ) : recentActivity.length > 0 ? (
                  <div className="space-y-4">
                    {recentActivity.map(activity => (
                      <div key={activity.id} className="flex items-center space-x-4 p-4 bg-white bg-opacity-50 rounded-xl">
                        <div className="w-10 h-10 bg-gradient-to-r from-primary to-accent rounded-full flex items-center justify-center">
                          <i className={`fas ${
                            activity.type === 'payment_made' ? 'fa-dollar-sign' :
                            activity.type === 'communication' ? 'fa-comment' :
                            activity.type === 'loan_created' ? 'fa-handshake' :
                            'fa-file-alt'
                          } text-white text-sm`}></i>
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-neutral-800">{activity.title}</p>
                          <p className="text-sm text-neutral-600">{activity.loanTitle}</p>
                        </div>
                        <span className="text-sm text-neutral-500">
                          {activity.createdAt ? new Date(activity.createdAt).toLocaleDateString() : 'Unknown date'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <i className="fas fa-clock text-4xl text-neutral-400 mb-4"></i>
                    <p className="text-neutral-600">No recent activity</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Floating Action Button */}
      <button 
        onClick={handleCreateLoan}
        className="fixed bottom-6 right-6 w-16 h-16 hero-gradient rounded-full shadow-lg text-white text-xl hover:shadow-xl transform hover:scale-110 transition-all duration-300 z-50"
      >
        <i className="fas fa-plus"></i>
      </button>
    </div>
  );
}
