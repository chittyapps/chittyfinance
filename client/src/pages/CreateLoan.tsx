import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import LoanCreationForm from "@/components/LoanCreationForm";

export default function CreateLoan() {
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

  const handleSuccess = () => {
    setLocation("/");
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
            <div className="w-8 h-8 bg-gradient-to-r from-primary to-accent rounded-lg flex items-center justify-center">
              <i className="fas fa-handshake text-white text-sm"></i>
            </div>
            <span className="text-xl font-bold text-neutral-800">Close Lender</span>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="pt-20 pb-16 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-neutral-800 mb-4">Create a New Loan</h1>
            <p className="text-xl text-neutral-600">Set up a professional loan agreement with guided AI assistance</p>
          </div>

          {/* Process Steps */}
          <div className="flex justify-center mb-8">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center text-sm font-medium">
                  1
                </div>
                <span className="text-sm font-medium text-primary">Loan Details</span>
              </div>
              <div className="w-8 h-0.5 bg-neutral-200"></div>
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-neutral-200 text-neutral-600 rounded-full flex items-center justify-center text-sm font-medium">
                  2
                </div>
                <span className="text-sm text-neutral-600">Review & Sign</span>
              </div>
              <div className="w-8 h-0.5 bg-neutral-200"></div>
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-neutral-200 text-neutral-600 rounded-full flex items-center justify-center text-sm font-medium">
                  3
                </div>
                <span className="text-sm text-neutral-600">Active Loan</span>
              </div>
            </div>
          </div>

          {/* Form */}
          <LoanCreationForm onSuccess={handleSuccess} />
        </div>
      </div>
    </div>
  );
}
