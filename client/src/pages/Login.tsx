import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";

export default function Login() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
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
        setError(data?.error === "invalid_credentials" ? "Invalid email or password" : "Login failed");
        return;
      }

      // Session cookie is set — reload to pick up auth state
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

        <form onSubmit={handleSubmit} className="cf-card p-5 space-y-4">
          {error && (
            <div className="text-xs text-rose-400 bg-rose-400/10 rounded px-3 py-2">{error}</div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs text-[hsl(var(--cf-text-secondary))]">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
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
  );
}
