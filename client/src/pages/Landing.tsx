import { Link } from 'wouter';
import {
  ArrowRight, BarChart3, Building2, Cable, ChevronRight, DollarSign,
  Lock, Shield, Sparkles, TrendingUp, Users, Zap,
} from 'lucide-react';

/* ─── Feature Card ─── */
function FeatureCard({
  icon: Icon,
  title,
  description,
  color,
  delay,
}: {
  icon: typeof Zap;
  title: string;
  description: string;
  color: string;
  delay: number;
}) {
  return (
    <div
      className="group cf-card cf-card-glow p-6 animate-slide-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
        style={{
          background: `hsl(${color} / 0.08)`,
          border: `1px solid hsl(${color} / 0.15)`,
        }}
      >
        <Icon className="w-5 h-5" style={{ color: `hsl(${color})` }} />
      </div>
      <h3 className="text-base font-display font-semibold text-[hsl(var(--cf-text))] mb-2">{title}</h3>
      <p className="text-sm text-[hsl(var(--cf-text-secondary))] leading-relaxed">{description}</p>
    </div>
  );
}

/* ─── Metric Stat ─── */
function Stat({ value, label, delay }: { value: string; label: string; delay: number }) {
  return (
    <div className="text-center animate-slide-up" style={{ animationDelay: `${delay}ms` }}>
      <p className="text-3xl lg:text-4xl font-display font-bold gradient-text">{value}</p>
      <p className="text-xs text-[hsl(var(--cf-text-muted))] uppercase tracking-wider mt-2">{label}</p>
    </div>
  );
}

/* ─── Integration Logo Mark ─── */
function IntegrationMark({ name, shortName, color }: { name: string; shortName: string; color: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="w-12 h-12 rounded-lg flex items-center justify-center text-xs font-display font-bold"
        style={{
          background: `hsl(${color} / 0.08)`,
          border: `1px solid hsl(${color} / 0.15)`,
          color: `hsl(${color})`,
        }}
      >
        {shortName}
      </div>
      <span className="text-[10px] text-[hsl(var(--cf-text-muted))]">{name}</span>
    </div>
  );
}

/* ─── Main Landing ─── */
export default function Landing() {
  return (
    <div className="min-h-screen bg-[hsl(var(--cf-void))] overflow-hidden">
      {/* ─── Nav ─── */}
      <nav className="flex items-center justify-between px-6 lg:px-12 py-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded bg-lime-400 flex items-center justify-center">
            <span className="text-black font-display font-bold text-sm">CF</span>
          </div>
          <span className="text-sm font-display font-semibold text-[hsl(var(--cf-text))]">ChittyFinance</span>
        </div>
        <div className="flex items-center gap-4">
          <a
            href="https://finance.chitty.cc/health"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:flex items-center gap-1.5 text-xs text-[hsl(var(--cf-text-muted))] hover:text-[hsl(var(--cf-text))] transition-colors"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--cf-emerald))]" style={{ boxShadow: '0 0 6px hsl(var(--cf-emerald) / 0.5)' }} />
            System Operational
          </a>
          <Link href="/login">
            <span className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium bg-[hsl(var(--cf-lime))] text-black hover:bg-[hsl(var(--cf-lime-bright))] transition-colors cursor-pointer">
              Sign In <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </Link>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <section className="relative px-6 lg:px-12 pt-16 pb-24 lg:pt-24 lg:pb-32 max-w-[1280px] mx-auto">
        {/* Background gradient orbs */}
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-[hsl(var(--cf-lime)/0.04)] rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-20 right-1/4 w-[300px] h-[300px] bg-[hsl(var(--cf-cyan)/0.03)] rounded-full blur-[100px] pointer-events-none" />

        <div className="relative text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[hsl(var(--cf-lime)/0.06)] border border-[hsl(var(--cf-lime)/0.12)] mb-6 animate-fade-in">
            <Sparkles className="w-3.5 h-3.5 text-[hsl(var(--cf-lime))]" />
            <span className="text-xs text-[hsl(var(--cf-lime))] font-medium">ChittyOS Tier 3 Service</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-bold text-[hsl(var(--cf-text))] tracking-tight leading-[1.1] animate-slide-up">
            Precision financial
            <br />
            <span className="gradient-text">operations at scale</span>
          </h1>

          <p className="text-base lg:text-lg text-[hsl(var(--cf-text-secondary))] mt-6 max-w-2xl mx-auto leading-relaxed animate-slide-up" style={{ animationDelay: '60ms' }}>
            Multi-entity financial management with real-time banking integrations,
            AI-powered analysis, property portfolio tracking, and forensic-grade audit trails.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8 animate-slide-up" style={{ animationDelay: '120ms' }}>
            <Link href="/login">
              <span className="flex items-center gap-2 px-6 py-3 rounded-md text-sm font-medium bg-[hsl(var(--cf-lime))] text-black hover:bg-[hsl(var(--cf-lime-bright))] transition-colors cursor-pointer">
                Open Dashboard
                <ArrowRight className="w-4 h-4" />
              </span>
            </Link>
            <Link href="/orbital">
              <span className="flex items-center gap-2 px-6 py-3 rounded-md text-sm font-medium text-[hsl(var(--cf-text-secondary))] border border-[hsl(var(--cf-border-subtle))] hover:border-[hsl(var(--cf-border-active))] hover:text-[hsl(var(--cf-text))] transition-colors cursor-pointer">
                Orbital Console
                <ChevronRight className="w-4 h-4" />
              </span>
            </Link>
          </div>

          <p className="text-[11px] text-[hsl(var(--cf-text-muted))] mt-4 animate-slide-up" style={{ animationDelay: '160ms' }}>
            Multi-tenant architecture with entity isolation and role-based access control.
          </p>
        </div>
      </section>

      {/* ─── Stats ─── */}
      <section className="px-6 lg:px-12 py-16 border-y border-[hsl(var(--cf-border-subtle))]">
        <div className="max-w-[1280px] mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          <Stat value="7" label="Managed Entities" delay={0} />
          <Stat value="4" label="Live Integrations" delay={60} />
          <Stat value="21" label="Forensic Endpoints" delay={120} />
          <Stat value="5" label="Valuation Sources" delay={180} />
        </div>
      </section>

      {/* ─── Features ─── */}
      <section className="px-6 lg:px-12 py-20">
        <div className="max-w-[1280px] mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl lg:text-3xl font-display font-bold text-[hsl(var(--cf-text))] tracking-tight">
              Built for multi-entity complexity
            </h2>
            <p className="text-sm text-[hsl(var(--cf-text-muted))] mt-3 max-w-xl mx-auto">
              Every feature designed for holding companies, series LLCs, property entities, and management companies operating as one.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            <FeatureCard
              icon={Building2}
              title="Multi-Tenant Hierarchy"
              description="IT CAN BE LLC entity tree with parent-child relationships, per-tenant financial isolation, and consolidated cross-entity reporting."
              color="var(--cf-lime)"
              delay={0}
            />
            <FeatureCard
              icon={Cable}
              title="Real Integrations"
              description="Mercury Bank via ChittyConnect, Wave Accounting OAuth 2.0, Stripe payments, and Google Workspace — no mock data."
              color="var(--cf-cyan)"
              delay={40}
            />
            <FeatureCard
              icon={Sparkles}
              title="AI CFO Assistant"
              description="GPT-4o financial advisor with full portfolio context. Scenario planning, cost reduction analysis, and execution queue triage."
              color="var(--cf-violet)"
              delay={80}
            />
            <FeatureCard
              icon={BarChart3}
              title="Forensic Accounting"
              description="21 forensic endpoints — Benford's Law analysis, duplicate detection, timing anomalies, flow-of-funds tracing, and damage calculations."
              color="var(--cf-amber)"
              delay={120}
            />
            <FeatureCard
              icon={TrendingUp}
              title="Property Valuation"
              description="Confidence-weighted aggregation from Zillow, Redfin, HouseCanary, ATTOM, and Cook County — 5 independent sources."
              color="var(--cf-emerald)"
              delay={160}
            />
            <FeatureCard
              icon={Shield}
              title="Role-Based Operations"
              description="CFO, Accountant, Bookkeeper, and User views with accountable agents, human checkpoints, and configurable automation policies."
              color="var(--cf-rose)"
              delay={200}
            />
          </div>
        </div>
      </section>

      {/* ─── Entity Structure ─── */}
      <section className="px-6 lg:px-12 py-16 border-t border-[hsl(var(--cf-border-subtle))]">
        <div className="max-w-[1280px] mx-auto">
          <div className="grid lg:grid-cols-[1fr_1.2fr] gap-8 items-center">
            <div>
              <h2 className="text-2xl font-display font-bold text-[hsl(var(--cf-text))] tracking-tight">
                Entity hierarchy,<br />visualized
              </h2>
              <p className="text-sm text-[hsl(var(--cf-text-muted))] mt-3 leading-relaxed">
                Navigate the full corporate structure from the sidebar entity tree.
                Each entity has isolated financials, dedicated accounts, and scoped access control.
              </p>
              <Link href="/login">
                <span className="inline-flex items-center gap-1.5 text-sm text-[hsl(var(--cf-lime))] hover:text-[hsl(var(--cf-lime-bright))] mt-4 cursor-pointer transition-colors">
                  Explore the structure <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </Link>
            </div>

            {/* Entity tree visual */}
            <div className="cf-card p-5">
              <div className="space-y-1.5">
                {[
                  { name: 'IT CAN BE LLC', type: 'holding', depth: 0, color: 'var(--cf-lime)' },
                  { name: 'JEAN ARLENE VENTURING LLC', type: 'personal', depth: 1, color: 'var(--cf-violet)' },
                  { name: 'ARIBIA LLC', type: 'series', depth: 1, color: 'var(--cf-cyan)' },
                  { name: 'ARIBIA LLC - MGMT', type: 'management', depth: 2, color: 'var(--cf-amber)' },
                  { name: 'ARIBIA LLC - CITY STUDIO', type: 'property', depth: 2, color: 'var(--cf-emerald)' },
                  { name: 'ARIBIA LLC - APT ARLENE', type: 'property', depth: 2, color: 'var(--cf-emerald)' },
                  { name: 'ChittyCorp LLC', type: 'holding', depth: 1, color: 'var(--cf-lime-dim)' },
                ].map((entity) => (
                  <div
                    key={entity.name}
                    className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-[hsl(var(--cf-raised))] transition-colors"
                    style={{ paddingLeft: `${entity.depth * 16 + 8}px` }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: `hsl(${entity.color})` }}
                    />
                    <span className="text-xs font-medium text-[hsl(var(--cf-text-secondary))]">{entity.name}</span>
                    <span
                      className="ml-auto text-[10px] px-1.5 py-0.5 rounded-sm"
                      style={{
                        background: `hsl(${entity.color} / 0.08)`,
                        color: `hsl(${entity.color})`,
                      }}
                    >
                      {entity.type}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Integrations ─── */}
      <section className="px-6 lg:px-12 py-16 border-t border-[hsl(var(--cf-border-subtle))]">
        <div className="max-w-[1280px] mx-auto text-center">
          <h2 className="text-2xl font-display font-bold text-[hsl(var(--cf-text))] tracking-tight mb-3">
            Automation surface
          </h2>
          <p className="text-sm text-[hsl(var(--cf-text-muted))] mb-10 max-w-lg mx-auto">
            Real production integrations via OAuth 2.0, REST APIs, and webhook-driven event processing.
          </p>
          <div className="flex flex-wrap justify-center gap-8">
            <IntegrationMark name="Mercury" shortName="MRC" color="var(--cf-cyan)" />
            <IntegrationMark name="Wave" shortName="WAV" color="var(--cf-emerald)" />
            <IntegrationMark name="Stripe" shortName="STP" color="var(--cf-violet)" />
            <IntegrationMark name="Google" shortName="GWS" color="var(--cf-amber)" />
            <IntegrationMark name="OpenAI" shortName="GPT" color="var(--cf-lime)" />
            <IntegrationMark name="GitHub" shortName="GH" color="var(--cf-text-secondary)" />
          </div>
        </div>
      </section>

      {/* ─── Security ─── */}
      <section className="px-6 lg:px-12 py-16 border-t border-[hsl(var(--cf-border-subtle))]">
        <div className="max-w-[1280px] mx-auto">
          <div className="cf-card p-8 lg:p-10 relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,hsl(var(--cf-lime)/0.06),transparent_50%)] pointer-events-none" />
            <div className="relative grid lg:grid-cols-2 gap-8 items-center">
              <div>
                <h2 className="text-2xl font-display font-bold text-[hsl(var(--cf-text))] tracking-tight">
                  Security by architecture
                </h2>
                <p className="text-sm text-[hsl(var(--cf-text-secondary))] mt-3 leading-relaxed">
                  Deployed on Cloudflare Workers with edge-native security.
                  HMAC-signed OAuth state tokens, webhook signature verification,
                  and idempotent event processing with KV deduplication.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: Lock, label: 'OAuth HMAC-SHA256', desc: 'CSRF-protected state tokens' },
                  { icon: Shield, label: 'Webhook Verification', desc: 'Cryptographic signatures' },
                  { icon: Users, label: 'Tenant Isolation', desc: 'Scoped data boundaries' },
                  { icon: DollarSign, label: 'Neon PostgreSQL', desc: 'Encrypted at rest' },
                ].map((item) => (
                  <div key={item.label} className="rounded-md border border-[hsl(var(--cf-border-subtle))] bg-[hsl(var(--cf-raised))] px-3 py-3">
                    <item.icon className="w-4 h-4 text-[hsl(var(--cf-lime))] mb-2" />
                    <p className="text-xs font-medium text-[hsl(var(--cf-text))]">{item.label}</p>
                    <p className="text-[10px] text-[hsl(var(--cf-text-muted))] mt-0.5">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="px-6 lg:px-12 py-20 border-t border-[hsl(var(--cf-border-subtle))]">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl lg:text-3xl font-display font-bold text-[hsl(var(--cf-text))] tracking-tight">
            Ready to operate with precision?
          </h2>
          <p className="text-sm text-[hsl(var(--cf-text-muted))] mt-3">
            Multi-entity financial operations, human-led with agent-accountable execution.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
            <Link href="/login">
              <span className="flex items-center gap-2 px-6 py-3 rounded-md text-sm font-medium bg-[hsl(var(--cf-lime))] text-black hover:bg-[hsl(var(--cf-lime-bright))] transition-colors cursor-pointer">
                Open Dashboard <ArrowRight className="w-4 h-4" />
              </span>
            </Link>
            <a
              href="https://finance.chitty.cc/api/v1/documentation"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-6 py-3 rounded-md text-sm font-medium text-[hsl(var(--cf-text-secondary))] border border-[hsl(var(--cf-border-subtle))] hover:border-[hsl(var(--cf-border-active))] hover:text-[hsl(var(--cf-text))] transition-colors"
            >
              API Documentation <ChevronRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="px-6 lg:px-12 py-8 border-t border-[hsl(var(--cf-border-subtle))]">
        <div className="max-w-[1280px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-lime-400 flex items-center justify-center">
              <span className="text-black font-display font-bold text-[10px]">CF</span>
            </div>
            <span className="text-xs text-[hsl(var(--cf-text-muted))]">ChittyFinance</span>
            <span className="text-[10px] text-[hsl(var(--cf-text-muted))] font-mono ml-2">v2.0.0</span>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-[hsl(var(--cf-text-muted))]">
            <span>finance.chitty.cc</span>
            <span>ChittyOS Tier 3</span>
            <a
              href="https://finance.chitty.cc/health"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-[hsl(var(--cf-text))] transition-colors"
            >
              <span className="w-1 h-1 rounded-full bg-[hsl(var(--cf-emerald))]" />
              Health
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
