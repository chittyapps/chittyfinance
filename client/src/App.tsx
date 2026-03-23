import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { createContext, lazy, Suspense, useContext, useEffect, useMemo, useState } from "react";
import Settings from "@/pages/Settings";
import Admin from "@/pages/Admin";
import Login from "@/pages/Login";
import ConnectAccounts from "@/pages/ConnectAccounts";
import NotFound from "@/pages/not-found";
import PropertyDetail from "@/pages/PropertyDetail";
import Properties from "@/pages/Properties";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import Connections from "@/pages/Connections";
import Dashboard from "@/pages/Dashboard";
import Transactions from "@/pages/Transactions";
import Accounts from "@/pages/Accounts";
import Reports from "@/pages/Reports";
import Integrations from "@/pages/Integrations";

// Lazy-load the Orbital Console (57KB + physics sim + canvas rendering)
const OrbitalConsole = lazy(() => import("@/pages/OrbitalConsole"));
import { User } from "@shared/schema";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { TenantProvider } from "@/contexts/TenantContext";
import { RoleProvider } from "@/contexts/RoleContext";

function Router() {
  const [location, setLocation] = useLocation();
  const { isAuthenticated } = useContext(AuthContext);
  const publicRoutes = ["/login", "/register", "/connect-accounts"];
  const isPublicRoute = publicRoutes.includes(location);

  // Redirect to login if not authenticated and not on a public route
  useEffect(() => {
    if (!isAuthenticated && !isPublicRoute) {
      setLocation("/login");
    }
  }, [isAuthenticated, isPublicRoute, setLocation]);

  const showChrome = !isPublicRoute && isAuthenticated;

  return (
    <div className="flex h-screen overflow-hidden">
      {showChrome && <Sidebar />}
      <div className="flex flex-col flex-1 w-0 overflow-hidden">
        {showChrome && <Header />}
        <main className="flex-1 relative overflow-y-auto cf-scrollbar focus:outline-none bg-[hsl(var(--cf-base))]">
          <Switch>
            <Route path="/" component={Properties} />
            <Route path="/dashboard" component={Dashboard} />
            <Route path="/transactions" component={Transactions} />
            <Route path="/accounts" component={Accounts} />
            <Route path="/reports" component={Reports} />
            <Route path="/integrations" component={Integrations} />
            <Route path="/properties/:id" component={PropertyDetail} />
            <Route path="/connections" component={Connections} />
            <Route path="/admin" component={Admin} />
            <Route path="/orbital">
              <Suspense fallback={
                <div className="flex items-center justify-center h-full bg-[hsl(var(--cf-void))]">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 rounded-full border-2 border-[hsl(var(--cf-lime)/0.3)] border-t-[hsl(var(--cf-lime))] animate-spin" />
                    <span className="text-xs text-[hsl(var(--cf-text-muted))] font-mono">Loading Orbital Console...</span>
                  </div>
                </div>
              }>
                <OrbitalConsole />
              </Suspense>
            </Route>
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
    fetch("/api/session", { credentials: "include" })
      .then(res => {
        if (!res.ok) throw new Error('Not authenticated');
        return res.json();
      })
      .then(data => {
        setUser(data as User);
        setLoading(false);
      })
      .catch(() => {
        setUser(null);
        setLoading(false);
      });
  }, []);

  const authContextValue = useMemo<AuthContextValue>(() => ({
    user,
    isAuthenticated: !!user,
    isLoading: loading,
  }), [user, loading]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[hsl(var(--cf-void))]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded bg-lime-400 flex items-center justify-center animate-pulse">
            <span className="text-black font-display font-bold text-sm">CF</span>
          </div>
          <span className="text-xs text-[hsl(var(--cf-text-muted))] font-mono">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TenantProvider>
          <RoleProvider>
            <AuthContext.Provider value={authContextValue}>
              <Router />
            </AuthContext.Provider>
          </RoleProvider>
        </TenantProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
