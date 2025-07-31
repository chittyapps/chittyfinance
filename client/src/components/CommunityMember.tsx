import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import type { User, LoanWithRelations } from "@shared/schema";

interface CommunityMemberProps {
  member: User & {
    relationship?: string;
    activeLoan?: LoanWithRelations;
    completedLoans?: number;
    totalLent?: number;
    totalBorrowed?: number;
    paymentRate?: number;
    trustScore?: number;
  };
  currentUserId: string;
}

export default function CommunityMember({ member, currentUserId }: CommunityMemberProps) {
  const [, setLocation] = useLocation();

  const handleViewProfile = () => {
    // In a real implementation, this would navigate to member profile
    console.log("View profile for:", member.id);
  };

  const handleCreateLoan = () => {
    setLocation(`/create-loan?borrower=${member.email}`);
  };

  const handleViewLoan = () => {
    if (member.activeLoan) {
      setLocation(`/loans/${member.activeLoan.id}`);
    }
  };

  const formatCurrency = (amount?: number) => {
    if (!amount) return "$0";
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getTrustLevel = (score?: number) => {
    if (!score) return { level: "New", color: "bg-neutral-100 text-neutral-800" };
    if (score >= 90) return { level: "Excellent", color: "bg-emerald-100 text-emerald-800" };
    if (score >= 80) return { level: "Very Good", color: "bg-blue-100 text-blue-800" };
    if (score >= 70) return { level: "Good", color: "bg-green-100 text-green-800" };
    if (score >= 60) return { level: "Fair", color: "bg-yellow-100 text-yellow-800" };
    return { level: "Poor", color: "bg-red-100 text-red-800" };
  };

  const getRelationshipIcon = (relationship?: string) => {
    switch (relationship) {
      case 'family':
        return 'fa-heart';
      case 'friend':
        return 'fa-user-friends';
      case 'colleague':
        return 'fa-briefcase';
      case 'neighbor':
        return 'fa-home';
      default:
        return 'fa-user';
    }
  };

  const trustInfo = getTrustLevel(member.trustScore);
  const displayName = member.firstName ? `${member.firstName} ${member.lastName || ''}`.trim() : member.email;

  return (
    <Card className="loan-card hover:shadow-lg transition-all duration-300">
      <CardContent className="p-6">
        {/* Member Header */}
        <div className="flex items-center space-x-4 mb-4">
          <div className="relative">
            {member.profileImageUrl ? (
              <img 
                src={member.profileImageUrl || ''} 
                alt={displayName}
                className="w-12 h-12 rounded-full object-cover"
              />
            ) : (
              <div className="w-12 h-12 bg-gradient-to-r from-secondary to-emerald-400 rounded-full flex items-center justify-center">
                <i className={`fas ${getRelationshipIcon(member.relationship)} text-white text-lg`}></i>
              </div>
            )}
            {member.paymentRate && member.paymentRate >= 95 && (
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                <i className="fas fa-check text-white text-xs"></i>
              </div>
            )}
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-neutral-800 mb-1">{displayName}</h3>
            <div className="flex items-center space-x-2">
              {member.relationship && (
                <span className="text-sm text-neutral-600 capitalize">
                  {member.relationship}
                </span>
              )}
              {member.paymentRate && (
                <span className="text-sm text-neutral-600">
                  • {member.paymentRate.toFixed(0)}% Payment Rate
                </span>
              )}
            </div>
          </div>
          <div className={`px-2 py-1 rounded-full text-xs font-medium ${trustInfo.color}`}>
            {trustInfo.level}
          </div>
        </div>

        {/* Loan Information */}
        <div className="space-y-3 mb-4">
          {member.activeLoan ? (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-blue-800">Active Loan</span>
                <span className="text-sm font-bold text-blue-900">
                  {formatCurrency(Number(member.activeLoan.remainingBalance))} remaining
                </span>
              </div>
              <div className="flex justify-between text-xs text-blue-700">
                <span>
                  {member.activeLoan.purpose || 'Personal Loan'}
                </span>
                <span>
                  Next payment: {member.activeLoan.nextPaymentDate ? 
                    new Date(member.activeLoan.nextPaymentDate).toLocaleDateString() : 
                    'TBD'
                  }
                </span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-neutral-600">Completed Loans</span>
                <p className="font-medium text-neutral-800">{member.completedLoans || 0}</p>
              </div>
              <div>
                <span className="text-neutral-600">Total History</span>
                <p className="font-medium text-neutral-800">
                  {formatCurrency((member.totalLent || 0) + (member.totalBorrowed || 0))}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Payment Performance */}
        {member.paymentRate && (
          <div className="mb-4">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-neutral-600">Payment Performance</span>
              <span className="font-medium text-neutral-800">{member.paymentRate.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-neutral-200 rounded-full h-2">
              <div 
                className={`h-2 rounded-full ${
                  member.paymentRate >= 95 ? 'bg-gradient-to-r from-emerald-500 to-green-400' :
                  member.paymentRate >= 85 ? 'bg-gradient-to-r from-blue-500 to-blue-400' :
                  member.paymentRate >= 75 ? 'bg-gradient-to-r from-yellow-500 to-yellow-400' :
                  'bg-gradient-to-r from-red-500 to-red-400'
                }`}
                style={{ width: `${Math.min(member.paymentRate, 100)}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex space-x-2">
          {member.activeLoan ? (
            <Button 
              onClick={handleViewLoan}
              className="flex-1 bg-white bg-opacity-50 text-neutral-700 hover:bg-opacity-70 transition-all"
              variant="outline"
            >
              <i className="fas fa-eye mr-2"></i>View Loan
            </Button>
          ) : (
            <Button 
              onClick={handleCreateLoan}
              className="flex-1 hero-gradient text-white hover:shadow-lg transition-all"
            >
              <i className="fas fa-plus mr-2"></i>Create Loan
            </Button>
          )}
          <Button 
            onClick={handleViewProfile}
            variant="outline"
            className="bg-white bg-opacity-50 hover:bg-opacity-70 transition-all"
          >
            <i className="fas fa-user"></i>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
