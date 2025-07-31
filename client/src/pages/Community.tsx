import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import CommunityMember from "@/components/CommunityMember";
import type { LoanWithRelations } from "@shared/schema";

export default function Community() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

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

  // Process loans data to create community members
  const communityMembers = loans ? loans.reduce((members, loan) => {
    if (!user) return members;
    
    // Determine the other party in the loan
    const isUserLender = loan.lenderId === user.id;
    const otherParty = isUserLender ? loan.borrower : loan.lender;
    const otherPartyId = isUserLender ? loan.borrowerId : loan.lenderId;
    
    // Find existing member or create new one
    let member = members.find(m => m.id === otherPartyId);
    if (!member) {
      member = {
        ...otherParty,
        relationship: 'friend', // Default relationship
        completedLoans: 0,
        totalLent: 0,
        totalBorrowed: 0,
        paymentRate: 0,
        trustScore: 85, // Default trust score
      };
      members.push(member);
    }

    // Update member stats based on loan
    if (loan.status === 'active') {
      member.activeLoan = loan;
    } else if (loan.status === 'completed') {
      member.completedLoans = (member.completedLoans || 0) + 1;
    }

    // Calculate payment performance (simplified)
    const totalPayments = loan.payments?.length || 0;
    const onTimePayments = loan.payments?.filter(p => 
      p.status === 'completed' || p.status === 'early'
    ).length || 0;
    
    if (totalPayments > 0) {
      member.paymentRate = (onTimePayments / totalPayments) * 100;
    } else {
      member.paymentRate = 100; // Default for new relationships
    }

    // Update financial totals
    const loanAmount = Number(loan.amount);
    if (isUserLender) {
      member.totalBorrowed = (member.totalBorrowed || 0) + loanAmount;
    } else {
      member.totalLent = (member.totalLent || 0) + loanAmount;
    }

    return members;
  }, [] as any[]) : [];

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
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="glass-morphism fixed top-0 left-0 right-0 z-50 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-r from-primary to-accent rounded-lg flex items-center justify-center">
              <i className="fas fa-handshake text-white text-sm"></i>
            </div>
            <span className="text-xl font-bold text-neutral-800">Close Lender</span>
          </div>
          
          <div className="hidden md:flex items-center space-x-6">
            <button 
              onClick={() => setLocation("/")}
              className="text-neutral-600 hover:text-primary transition-colors"
            >
              Dashboard
            </button>
            <button 
              onClick={() => setLocation("/community")}
              className="text-primary font-medium transition-colors"
            >
              Community
            </button>
          </div>

          <div className="flex items-center space-x-3">
            <Button
              onClick={handleCreateLoan}
              className="hero-gradient text-white hover:shadow-lg transform hover:scale-105 transition-all duration-300"
            >
              <i className="fas fa-plus mr-2"></i>
              New Loan
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
            <h1 className="text-4xl font-bold text-neutral-800 mb-2">Your Lending Community</h1>
            <p className="text-xl text-neutral-600">Connect with trusted friends, family, and neighbors for mutual financial support</p>
          </div>

          {/* Community Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card className="loan-card">
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 bg-gradient-to-r from-primary to-blue-400 rounded-xl mx-auto mb-4 flex items-center justify-center">
                  <i className="fas fa-users text-white text-xl"></i>
                </div>
                <h3 className="text-2xl font-bold text-neutral-800">{communityMembers.length}</h3>
                <p className="text-neutral-600">Community Members</p>
              </CardContent>
            </Card>

            <Card className="loan-card">
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 bg-gradient-to-r from-secondary to-emerald-400 rounded-xl mx-auto mb-4 flex items-center justify-center">
                  <i className="fas fa-handshake text-white text-xl"></i>
                </div>
                <h3 className="text-2xl font-bold text-neutral-800">
                  {communityMembers.filter(m => m.activeLoan).length}
                </h3>
                <p className="text-neutral-600">Active Relationships</p>
              </CardContent>
            </Card>

            <Card className="loan-card">
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 bg-gradient-to-r from-accent to-purple-400 rounded-xl mx-auto mb-4 flex items-center justify-center">
                  <i className="fas fa-star text-white text-xl"></i>
                </div>
                <h3 className="text-2xl font-bold text-neutral-800">
                  {communityMembers.length > 0 ? 
                    Math.round(communityMembers.reduce((sum, m) => sum + (m.trustScore || 0), 0) / communityMembers.length) : 
                    0
                  }
                </h3>
                <p className="text-neutral-600">Avg Trust Score</p>
              </CardContent>
            </Card>

            <Card className="loan-card">
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 bg-gradient-to-r from-emerald-500 to-green-400 rounded-xl mx-auto mb-4 flex items-center justify-center">
                  <i className="fas fa-percentage text-white text-xl"></i>
                </div>
                <h3 className="text-2xl font-bold text-neutral-800">
                  {communityMembers.length > 0 ? 
                    Math.round(communityMembers.reduce((sum, m) => sum + (m.paymentRate || 0), 0) / communityMembers.length) : 
                    0
                  }%
                </h3>
                <p className="text-neutral-600">Avg Payment Rate</p>
              </CardContent>
            </Card>
          </div>

          {/* Search and Filters */}
          <Card className="loan-card mb-8">
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="flex-1 max-w-md">
                  <Input 
                    placeholder="Search community members..."
                    className="w-full"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Button variant="outline" size="sm">
                    <i className="fas fa-filter mr-2"></i>All Members
                  </Button>
                  <Button variant="ghost" size="sm">
                    Active Loans
                  </Button>
                  <Button variant="ghost" size="sm">
                    Family
                  </Button>
                  <Button variant="ghost" size="sm">
                    Friends
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Community Members Grid */}
          {loansLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <Card key={i} className="loan-card animate-pulse">
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-4 mb-4">
                      <div className="w-12 h-12 bg-neutral-200 rounded-full"></div>
                      <div className="flex-1">
                        <div className="h-4 bg-neutral-200 rounded mb-2"></div>
                        <div className="h-3 bg-neutral-200 rounded w-2/3"></div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="h-16 bg-neutral-200 rounded"></div>
                      <div className="h-8 bg-neutral-200 rounded"></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : communityMembers.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {communityMembers.map(member => (
                <CommunityMember 
                  key={member.id} 
                  member={member} 
                  currentUserId={user.id}
                />
              ))}
            </div>
          ) : (
            <Card className="loan-card">
              <CardContent className="p-12 text-center">
                <i className="fas fa-users text-6xl text-neutral-400 mb-6"></i>
                <h3 className="text-2xl font-bold text-neutral-800 mb-4">Build Your Community</h3>
                <p className="text-neutral-600 mb-6 max-w-md mx-auto">
                  Start by creating your first loan. As you lend to and borrow from others, 
                  you'll build a trusted community of financial partners.
                </p>
                <Button 
                  onClick={handleCreateLoan}
                  className="hero-gradient text-white px-8 py-3"
                >
                  <i className="fas fa-plus mr-2"></i>
                  Create Your First Loan
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Invite Section */}
          <Card className="loan-card mt-8">
            <CardHeader>
              <CardTitle className="text-2xl font-bold text-neutral-800">Invite to Community</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row gap-4">
                <Input 
                  placeholder="Enter email address to invite..."
                  className="flex-1"
                />
                <Button className="hero-gradient text-white">
                  <i className="fas fa-paper-plane mr-2"></i>
                  Send Invitation
                </Button>
              </div>
              <p className="text-sm text-neutral-600 mt-3">
                Invite trusted friends and family to join your lending community. 
                They'll receive an email with instructions to create their account.
              </p>
            </CardContent>
          </Card>
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
