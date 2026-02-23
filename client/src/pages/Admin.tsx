import { formatDate } from "@/lib/utils";
import {
  Server, Database, Cloud,
  RefreshCw, Clock, CheckCircle2, AlertTriangle, XCircle,
  Cpu, HardDrive, Globe, Settings2,
  ChevronRight
} from "lucide-react";
import { motion } from "framer-motion";

const stagger = {
  animate: { transition: { staggerChildren: 0.05 } },
};

const fadeUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

/* ─── Service Health Data ─── */
interface ServiceHealth {
  name: string;
  url: string;
  status: "healthy" | "degraded" | "down" | "unknown";
  latency?: number;
  lastCheck: string;
  version?: string;
}

const SERVICES: ServiceHealth[] = [
  { name: "ChittyFinance", url: "finance.chitty.cc", status: "healthy", latency: 42, lastCheck: "Just now", version: "2.0.0" },
  { name: "ChittyConnect", url: "connect.chitty.cc", status: "healthy", latency: 38, lastCheck: "30s ago", version: "1.4.2" },
  { name: "ChittyAuth", url: "auth.chitty.cc", status: "healthy", latency: 24, lastCheck: "30s ago", version: "1.2.0" },
  { name: "ChittyCommand", url: "command.chitty.cc", status: "healthy", latency: 67, lastCheck: "1m ago", version: "3.1.0" },
  { name: "ChittyRegister", url: "register.chitty.cc", status: "healthy", latency: 31, lastCheck: "1m ago", version: "1.0.5" },
  { name: "ChittyRouter", url: "router.chitty.cc", status: "degraded", latency: 234, lastCheck: "2m ago", version: "1.1.0" },
  { name: "DoorLoop", url: "api.doorloop.com", status: "unknown", lastCheck: "—" },
  { name: "Wave Accounting", url: "api.waveapps.com", status: "healthy", latency: 156, lastCheck: "5m ago" },
];

/* ─── Integration Config ─── */
interface IntegrationConfig {
  name: string;
  configured: boolean;
  envVars: string[];
  status: "active" | "inactive" | "error";
  lastSync?: string;
}

const INTEGRATIONS: IntegrationConfig[] = [
  { name: "Mercury Bank", configured: true, envVars: ["CHITTYCONNECT_API_BASE", "CHITTYCONNECT_API_TOKEN"], status: "active", lastSync: "2m ago" },
  { name: "Wave Accounting", configured: true, envVars: ["WAVE_CLIENT_ID", "WAVE_CLIENT_SECRET"], status: "active", lastSync: "1h ago" },
  { name: "Stripe Payments", configured: true, envVars: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"], status: "active", lastSync: "5m ago" },
  { name: "OpenAI (GPT-4o)", configured: true, envVars: ["OPENAI_API_KEY"], status: "active" },
  { name: "DoorLoop", configured: false, envVars: ["DOORLOOP_API_KEY"], status: "inactive" },
  { name: "GitHub", configured: true, envVars: ["GITHUB_TOKEN"], status: "active" },
];

/* ─── Deployment Pipeline ─── */
interface Deployment {
  service: string;
  environment: string;
  status: "deployed" | "building" | "failed" | "queued";
  commitHash: string;
  deployedAt: string;
  deployedBy: string;
}

const DEPLOYMENTS: Deployment[] = [
  { service: "ChittyFinance", environment: "production", status: "deployed", commitHash: "0d21cd9", deployedAt: "2026-02-23 14:32", deployedBy: "claude" },
  { service: "ChittyConnect", environment: "production", status: "deployed", commitHash: "a8f3bc1", deployedAt: "2026-02-22 09:15", deployedBy: "nb" },
  { service: "ChittyAuth", environment: "production", status: "deployed", commitHash: "e5d2f01", deployedAt: "2026-02-21 16:45", deployedBy: "nb" },
  { service: "ChittyCommand", environment: "staging", status: "building", commitHash: "7bc4a2d", deployedAt: "Building...", deployedBy: "claude" },
];

export default function Admin() {
  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
      {/* Page Title */}
      <div className="mb-6">
        <h1 className="text-xl font-display font-semibold text-[hsl(var(--cf-text))]">
          System Administration
        </h1>
        <p className="text-xs text-[hsl(var(--cf-text-muted))] mt-1">
          Service health, deployments, and integrations · {formatDate(new Date())}
        </p>
      </div>

      <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-6">

        {/* System Overview Strip */}
        <motion.div variants={fadeUp} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SystemMetric icon={<Server className="w-4 h-4" />} label="Services" value="6/8" sublabel="online" status="healthy" />
          <SystemMetric icon={<Database className="w-4 h-4" />} label="Database" value="Neon" sublabel="PostgreSQL" status="healthy" />
          <SystemMetric icon={<Cloud className="w-4 h-4" />} label="Workers" value="4" sublabel="deployed" status="healthy" />
          <SystemMetric icon={<Cpu className="w-4 h-4" />} label="Avg Latency" value="54ms" sublabel="p99: 234ms" status="degraded" />
        </motion.div>

        {/* Service Health Grid */}
        <motion.div variants={fadeUp} className="cf-card">
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <h3 className="cf-section-title">Service Health</h3>
            <button className="flex items-center gap-1.5 text-[10px] font-medium text-[hsl(var(--cf-text-muted))] hover:text-[hsl(var(--cf-text))] transition-colors">
              <RefreshCw className="w-3 h-3" />
              Refresh
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 px-4 pb-4">
            {SERVICES.map((svc) => (
              <ServiceHealthCard key={svc.name} service={svc} />
            ))}
          </div>
        </motion.div>

        {/* Deployments + Integrations */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Deployment Pipeline */}
          <motion.div variants={fadeUp} className="cf-card">
            <div className="flex items-center justify-between px-4 pt-4 pb-3">
              <h3 className="cf-section-title">Recent Deployments</h3>
              <button className="text-[10px] font-medium text-[hsl(var(--cf-lime))] hover:underline flex items-center gap-0.5">
                Deploy <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <div className="pb-2">
              {DEPLOYMENTS.map((dep) => (
                <DeploymentRow key={`${dep.service}-${dep.commitHash}`} deployment={dep} />
              ))}
            </div>
          </motion.div>

          {/* Integration Status */}
          <motion.div variants={fadeUp} className="cf-card">
            <div className="flex items-center justify-between px-4 pt-4 pb-3">
              <h3 className="cf-section-title">Integration Configuration</h3>
              <button className="text-[10px] font-medium text-[hsl(var(--cf-lime))] hover:underline flex items-center gap-0.5">
                Manage <Settings2 className="w-3 h-3 ml-0.5" />
              </button>
            </div>
            <div className="px-4 pb-4 space-y-2">
              {INTEGRATIONS.map((int_) => (
                <IntegrationCard key={int_.name} integration={int_} />
              ))}
            </div>
          </motion.div>
        </div>

        {/* System Metrics */}
        <motion.div variants={fadeUp} className="cf-card">
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <h3 className="cf-section-title">Infrastructure</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-4 pb-4">
            <InfraCard
              title="Neon PostgreSQL"
              icon={<Database className="w-4 h-4" />}
              metrics={[
                { label: "Region", value: "us-east-2" },
                { label: "Tables", value: "14" },
                { label: "Size", value: "42 MB" },
                { label: "Connections", value: "3/100" },
              ]}
              status="healthy"
            />
            <InfraCard
              title="Cloudflare Workers"
              icon={<Globe className="w-4 h-4" />}
              metrics={[
                { label: "Requests/day", value: "1,247" },
                { label: "CPU time", value: "12ms avg" },
                { label: "Errors", value: "0.02%" },
                { label: "Edge locations", value: "300+" },
              ]}
              status="healthy"
            />
            <InfraCard
              title="KV + R2 Storage"
              icon={<HardDrive className="w-4 h-4" />}
              metrics={[
                { label: "KV reads/day", value: "342" },
                { label: "KV writes/day", value: "28" },
                { label: "R2 objects", value: "156" },
                { label: "R2 size", value: "2.3 GB" },
              ]}
              status="healthy"
            />
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

/* ─── Sub-components ─── */

function SystemMetric({ icon, label, value, sublabel, status }: {
  icon: React.ReactNode; label: string; value: string; sublabel: string; status: "healthy" | "degraded" | "down";
}) {
  return (
    <div className="cf-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[hsl(var(--cf-text-muted))]">{icon}</span>
        <div className="cf-status-dot" data-status={status} />
      </div>
      <div className="text-lg font-display font-semibold text-[hsl(var(--cf-text))]">{value}</div>
      <div className="flex items-center gap-1 mt-0.5">
        <span className="text-[10px] text-[hsl(var(--cf-text-muted))]">{label}</span>
        <span className="text-[10px] text-[hsl(var(--cf-text-muted))]">·</span>
        <span className="text-[10px] text-[hsl(var(--cf-text-muted))]">{sublabel}</span>
      </div>
    </div>
  );
}

function ServiceHealthCard({ service }: { service: ServiceHealth }) {
  const statusIcon = {
    healthy: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />,
    degraded: <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />,
    down: <XCircle className="w-3.5 h-3.5 text-rose-400" />,
    unknown: <Clock className="w-3.5 h-3.5 text-[hsl(var(--cf-text-muted))]" />,
  };

  return (
    <div className="cf-health-card" data-status={service.status}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {statusIcon[service.status]}
          <span className="text-sm font-medium text-[hsl(var(--cf-text))] truncate">{service.name}</span>
        </div>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-[10px] font-mono text-[hsl(var(--cf-text-muted))]">{service.url}</span>
          {service.latency && (
            <span className={`text-[10px] font-mono ${service.latency > 200 ? "text-amber-400" : "text-[hsl(var(--cf-text-muted))]"}`}>
              {service.latency}ms
            </span>
          )}
          {service.version && (
            <span className="text-[10px] font-mono text-[hsl(var(--cf-text-muted))]">v{service.version}</span>
          )}
        </div>
      </div>
      <span className="text-[10px] text-[hsl(var(--cf-text-muted))]">{service.lastCheck}</span>
    </div>
  );
}

function DeploymentRow({ deployment }: { deployment: Deployment }) {
  const statusColors = {
    deployed: "text-emerald-400",
    building: "text-cyan-400",
    failed: "text-rose-400",
    queued: "text-[hsl(var(--cf-text-muted))]",
  };

  const statusIcons = {
    deployed: <CheckCircle2 className="w-3 h-3" />,
    building: <RefreshCw className="w-3 h-3 animate-spin" />,
    failed: <XCircle className="w-3 h-3" />,
    queued: <Clock className="w-3 h-3" />,
  };

  return (
    <div className="cf-table-row px-4">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className={statusColors[deployment.status]}>{statusIcons[deployment.status]}</span>
        <div className="min-w-0">
          <span className="text-sm text-[hsl(var(--cf-text))] truncate block">{deployment.service}</span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-[hsl(var(--cf-lime))]">{deployment.commitHash}</span>
            <span className="text-[10px] text-[hsl(var(--cf-text-muted))]">{deployment.environment}</span>
          </div>
        </div>
      </div>
      <div className="text-right">
        <span className="text-[10px] text-[hsl(var(--cf-text-muted))] block">{deployment.deployedAt}</span>
        <span className="text-[10px] text-[hsl(var(--cf-text-muted))]">by {deployment.deployedBy}</span>
      </div>
    </div>
  );
}

function IntegrationCard({ integration }: { integration: IntegrationConfig }) {
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded bg-[hsl(var(--cf-raised))] border border-[hsl(var(--cf-border-subtle))]">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-2 h-2 rounded-full ${
          integration.status === "active" ? "bg-emerald-400" :
          integration.status === "error" ? "bg-rose-400" : "bg-[hsl(var(--cf-text-muted))]"
        }`} />
        <div className="min-w-0">
          <div className="text-sm text-[hsl(var(--cf-text))] truncate">{integration.name}</div>
          <div className="text-[10px] font-mono text-[hsl(var(--cf-text-muted))]">
            {integration.envVars.join(", ")}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {integration.lastSync && (
          <span className="text-[10px] text-[hsl(var(--cf-text-muted))]">{integration.lastSync}</span>
        )}
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
          integration.configured
            ? "bg-emerald-500/10 text-emerald-400"
            : "bg-[hsl(var(--cf-overlay))] text-[hsl(var(--cf-text-muted))]"
        }`}>
          {integration.configured ? "Configured" : "Not Set"}
        </span>
      </div>
    </div>
  );
}

function InfraCard({ title, icon, metrics, status }: {
  title: string; icon: React.ReactNode; metrics: { label: string; value: string }[]; status: "healthy" | "degraded" | "down";
}) {
  return (
    <div className="p-4 rounded bg-[hsl(var(--cf-raised))] border border-[hsl(var(--cf-border-subtle))]">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[hsl(var(--cf-text-muted))]">{icon}</span>
          <span className="text-sm font-medium text-[hsl(var(--cf-text))]">{title}</span>
        </div>
        <div className="cf-status-dot" data-status={status} />
      </div>
      <div className="space-y-1.5">
        {metrics.map((m) => (
          <div key={m.label} className="flex items-center justify-between">
            <span className="text-[10px] text-[hsl(var(--cf-text-muted))]">{m.label}</span>
            <span className="text-xs font-mono text-[hsl(var(--cf-text))]">{m.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
