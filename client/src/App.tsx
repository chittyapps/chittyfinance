import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/AuthPage";
import Dashboard from "@/pages/Dashboard";
import LoanDetails from "@/pages/LoanDetails";
import CreateLoan from "@/pages/CreateLoan";
import Community from "@/pages/Community";
import Settings from "@/pages/Settings";
import TaxImplications from "@/pages/TaxImplications";
import LoanStatements from "@/pages/LoanStatements";
import AIDocumentProcessor from "@/pages/AIDocumentProcessorNew";
import TestAuth from "@/pages/TestAuth";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-white to-secondary/5 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 hero-gradient rounded-2xl flex items-center justify-center mx-auto mb-4">
            <i className="fas fa-spinner fa-spin text-white text-2xl"></i>
          </div>
          <p className="text-neutral-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <Switch>
      {!isAuthenticated ? (
        <>
          <Route path="/" component={AuthPage} />
          <Route path="/test-auth" component={TestAuth} />
        </>
      ) : (
        <>
          <Route path="/" component={Dashboard} />
          <Route path="/loans/:id" component={LoanDetails} />
          <Route path="/create-loan" component={CreateLoan} />
          <Route path="/community" component={Community} />
          <Route path="/settings" component={Settings} />
          <Route path="/tax-implications" component={TaxImplications} />
          <Route path="/loans/:id/statements" component={LoanStatements} />
          <Route path="/ai-document-processor" component={AIDocumentProcessor} />
        </>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
