import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { createContext, useEffect, useMemo, useState } from "react";
import Dashboard from "@/pages/Dashboard";
import Settings from "@/pages/Settings";
import Login from "@/pages/Login";
import ConnectAccounts from "@/pages/ConnectAccounts";
import NotFound from "@/pages/not-found";
import ValuationConsole from "@/pages/ValuationConsole";
import Properties from "@/pages/Properties";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import Connections from "@/pages/Connections";
import { User } from "@shared/schema";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { TenantProvider } from "@/contexts/TenantContext";

function Router() {
  const [location] = useLocation();
  const showSidebar = location !== "/login" && location !== "/register" && location !== "/connect-accounts";

  return (
    <div className="flex h-screen overflow-hidden">
      {showSidebar && <Sidebar />}
      <div className="flex flex-col flex-1 w-0 overflow-hidden">
        {showSidebar && <Header />}
        <main className="flex-1 relative overflow-y-auto focus:outline-none">
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/properties" component={Properties} />
            <Route path="/valuation/550-w-surf-504" component={ValuationConsole} />
            <Route path="/connections" component={Connections} />
            <Route path="/settings" component={Settings} />
            <Route path="/login" component={Login} />
            <Route path="/connect-accounts" component={ConnectAccounts} />
            <Route component={NotFound} />
          </Switch>
        </main>
      </div>
      <Toaster />
    </div>
  );
}

export type AuthContextValue = {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
};

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
});

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Attempt to get the user session
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
      <div className="flex items-center justify-center h-screen bg-zinc-950">
        <div className="animate-spin w-8 h-8 border-4 border-lime-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  const authContextValue = useMemo<AuthContextValue>(() => ({
    user,
    isAuthenticated: !!user,
    isLoading: loading,
  }), [user, loading]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TenantProvider>
          <AuthContext.Provider value={authContextValue}>
            <Router />
          </AuthContext.Provider>
        </TenantProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
