import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { useEffect, useState, createContext } from "react";
import Dashboard from "@/pages/Dashboard";
import Settings from "@/pages/Settings";
import Login from "@/pages/Login";
import ConnectAccounts from "@/pages/ConnectAccounts";
import NotFound from "@/pages/not-found";
import Header from "@/components/layout/Header";
import { User } from "@shared/schema";

export const AuthContext = createContext<{
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
});

function Router() {
  const [location] = useLocation();
  const showLayout = location !== "/login";

  return (
    <div className="min-h-screen bg-background">
      {showLayout && <Header />}
      <main className="pb-safe">
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/properties" component={Dashboard} />
          <Route path="/automations" component={ConnectAccounts} />
          <Route path="/settings" component={Settings} />
          <Route path="/login" component={Login} />
          <Route path="/connect-accounts" component={ConnectAccounts} />
          <Route component={NotFound} />
        </Switch>
      </main>
      <Toaster />
    </div>
  );
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/session")
      .then(res => {
        if (!res.ok) {
          throw new Error('Not authenticated');
        }
        return res.json();
      })
      .then(data => {
        setUser(data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to get session:", err);
        setUser(null);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading your portfolio...</p>
        </div>
      </div>
    );
  }

  const authContextValue = {
    user,
    isAuthenticated: !!user,
    isLoading: loading
  };

  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={authContextValue}>
        <Router />
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

export default App;
