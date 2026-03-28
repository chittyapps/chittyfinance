import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "Invalid email or password",
  no_account: "No ChittyFinance account linked to this ChittyID",
  account_disabled: "Account is disabled",
  token_exchange: "Authentication failed — try again",
  auth_unavailable: "ChittyID service unavailable",
  invalid_state: "Session expired — try again",
  expired_session: "Session expired — try again",
  no_identity: "Could not retrieve identity",
};

export default function Login() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    return err ? (ERROR_MESSAGES[err] || err) : "";
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null) as { error?: string } | null;
        setError(ERROR_MESSAGES[data?.error || ""] || "Login failed");
        return;
      }

      window.location.href = "/";
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--cf-void))] p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-10 h-10 rounded bg-lime-400 flex items-center justify-center mx-auto mb-3">
            <span className="text-black font-display font-bold text-lg">CF</span>
          </div>
          <h1 className="text-xl font-display font-semibold text-[hsl(var(--cf-text))]">ChittyFinance</h1>
          <p className="text-xs text-[hsl(var(--cf-text-muted))] mt-1">Sign in to continue</p>
        </div>

        <div className="cf-card p-5 space-y-4">
          {error && (
            <div className="text-xs text-rose-400 bg-rose-400/10 rounded px-3 py-2">{error}</div>
          )}

          <a
            href="/api/auth/chittyid/authorize"
            className="flex items-center justify-center gap-2 w-full h-9 rounded-md bg-[hsl(var(--cf-surface))] border border-[hsl(var(--cf-border-subtle))] text-sm font-medium text-[hsl(var(--cf-text))] hover:bg-[hsl(var(--cf-surface-hover))] transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
              <rect width="16" height="16" rx="3" fill="#667eea"/>
              <text x="8" y="12" textAnchor="middle" fontSize="10" fontWeight="700" fill="white">ID</text>
            </svg>
            Sign in with ChittyID
          </a>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[hsl(var(--cf-border-subtle))]" />
            <span className="text-[10px] text-[hsl(var(--cf-text-muted))] uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-[hsl(var(--cf-border-subtle))]" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs text-[hsl(var(--cf-text-secondary))]">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-9 text-sm"
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs text-[hsl(var(--cf-text-secondary))]">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-9 text-sm"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-lime-500 hover:bg-lime-600 text-black font-medium h-9 text-sm"
            >
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
