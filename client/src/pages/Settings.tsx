import { useEffect, useState, type ReactNode } from 'react';
import { Bot, CheckCircle2, RotateCcw, Save, ShieldCheck, Users, Workflow } from 'lucide-react';
import { useRole } from '@/contexts/RoleContext';
import { useToast } from '@/hooks/use-toast';
import { useOperatingPreferences } from '@/hooks/use-operating-preferences';
import {
  ACCOUNTABLE_AGENTS,
  DEFAULT_OPERATING_PREFERENCES,
  ROLE_CONFIGS,
  SCENARIOS,
  type AutomationMode,
  type DigestCadence,
  type OperatingPreferences,
} from '@/lib/operating-model';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

function Section({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="cf-card overflow-hidden">
      <div className="px-4 py-3 border-b border-[hsl(var(--cf-border-subtle))] flex items-center gap-2">
        <span className="text-[hsl(var(--cf-lime))]">{icon}</span>
        <div>
          <h2 className="text-sm font-display font-semibold text-[hsl(var(--cf-text))]">{title}</h2>
          <p className="text-[11px] text-[hsl(var(--cf-text-muted))]">{subtitle}</p>
        </div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export default function Settings() {
  const { toast } = useToast();
  const { currentRole } = useRole();
  const { preferences, updatePreferences, resetPreferences } = useOperatingPreferences();
  const [draft, setDraft] = useState<OperatingPreferences>(preferences);

  useEffect(() => {
    setDraft(preferences);
  }, [preferences]);

  const saveDraft = () => {
    updatePreferences(draft);
    toast({
      title: 'Operating settings saved',
      description: 'Leader, scenario, and automation policy are now applied to the workspace.',
    });
  };

  const resetDraft = () => {
    resetPreferences();
    setDraft(DEFAULT_OPERATING_PREFERENCES);
    toast({
      title: 'Operating settings reset',
      description: 'Workspace returned to the default human-led operating model.',
    });
  };

  const updateDraft = <K extends keyof OperatingPreferences>(key: K, value: OperatingPreferences[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const saveAgents = () => {
    updatePreferences({ enabledAgentIds: draft.enabledAgentIds });
    toast({
      title: 'Agent roster updated',
      description: 'Accountable agent assignments were persisted for this operator seat.',
    });
  };

  const handleAgentToggle = (agentId: string) => {
    setDraft((current) => ({
      ...current,
      enabledAgentIds: current.enabledAgentIds.includes(agentId)
        ? current.enabledAgentIds.filter((id) => id !== agentId)
        : [...current.enabledAgentIds, agentId],
    }));
  };

  return (
    <div className="p-6 lg:p-8 max-w-[1280px] mx-auto space-y-6 animate-slide-up">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-semibold text-[hsl(var(--cf-text))]">Settings</h1>
          <p className="text-sm text-[hsl(var(--cf-text-muted))] mt-1">
            Configure the single human lead, accountable agents, and role-aware automations.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={resetDraft}>
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </Button>
          <Button size="sm" className="gap-1.5 bg-lime-500 hover:bg-lime-600 text-black" onClick={saveDraft}>
            <Save className="w-3.5 h-3.5" /> Save
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Section
          icon={<Users className="w-4 h-4" />}
          title="Leader Model"
          subtitle="Who is accountable, how decisions flow, and what role view drives the shell."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs text-[hsl(var(--cf-text-muted))]">Human Lead</Label>
              <Input
                value={draft.leaderName}
                onChange={(event) => updateDraft('leaderName', event.target.value)}
                className="bg-[hsl(var(--cf-surface))] border-[hsl(var(--cf-border-subtle))]"
                placeholder="Name"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-[hsl(var(--cf-text-muted))]">Default Role View</Label>
              <div className="h-10 rounded-md border border-[hsl(var(--cf-border-subtle))] bg-[hsl(var(--cf-raised))] px-3 flex items-center">
                <span className="cf-role-badge" data-role={currentRole}>{ROLE_CONFIGS.find((role) => role.id === currentRole)?.label}</span>
                <span className="text-xs text-[hsl(var(--cf-text-muted))] ml-2">active for this session</span>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 mt-4">
            <div className="space-y-2">
              <Label className="text-xs text-[hsl(var(--cf-text-muted))]">Automation Mode</Label>
              <Select
                value={draft.automationMode}
                onValueChange={(value) => updateDraft('automationMode', value as AutomationMode)}
              >
                <SelectTrigger className="bg-[hsl(var(--cf-surface))] border-[hsl(var(--cf-border-subtle))]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="human-led">Human-led</SelectItem>
                  <SelectItem value="balanced">Balanced</SelectItem>
                  <SelectItem value="delegated">Delegated</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-[hsl(var(--cf-text-muted))]">Digest Cadence</Label>
              <Select
                value={draft.digestCadence}
                onValueChange={(value) => updateDraft('digestCadence', value as DigestCadence)}
              >
                <SelectTrigger className="bg-[hsl(var(--cf-surface))] border-[hsl(var(--cf-border-subtle))]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hourly">Hourly</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-md border border-[hsl(var(--cf-border-subtle))] bg-[hsl(var(--cf-raised))] px-3 py-3">
              <p className="text-xs text-[hsl(var(--cf-text-muted))] uppercase tracking-[0.08em]">Escalation</p>
              <p className="text-sm text-[hsl(var(--cf-text))] mt-2">
                {draft.autoEscalateApprovals ? 'Agent-driven' : 'Manual only'}
              </p>
            </div>
            <div className="rounded-md border border-[hsl(var(--cf-border-subtle))] bg-[hsl(var(--cf-raised))] px-3 py-3">
              <p className="text-xs text-[hsl(var(--cf-text-muted))] uppercase tracking-[0.08em]">Approval Policy</p>
              <p className="text-sm text-[hsl(var(--cf-text))] mt-2">
                {draft.requireHumanApproval ? 'Human required' : 'Auto-approved allowed'}
              </p>
            </div>
            <div className="rounded-md border border-[hsl(var(--cf-border-subtle))] bg-[hsl(var(--cf-raised))] px-3 py-3">
              <p className="text-xs text-[hsl(var(--cf-text-muted))] uppercase tracking-[0.08em]">Task Routing</p>
              <p className="text-sm text-[hsl(var(--cf-text))] mt-2">
                {draft.autoCreateTasks ? 'Create automatically' : 'Manual capture'}
              </p>
            </div>
          </div>
        </Section>

        <Section
          icon={<Workflow className="w-4 h-4" />}
          title="Scenario Pack"
          subtitle="Choose the operating scenario your team and agents optimize around."
        >
          <div className="space-y-3">
            <Label className="text-xs text-[hsl(var(--cf-text-muted))]">Active Scenario</Label>
            <Select value={draft.activeScenarioId} onValueChange={(value) => updateDraft('activeScenarioId', value)}>
              <SelectTrigger className="bg-[hsl(var(--cf-surface))] border-[hsl(var(--cf-border-subtle))]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCENARIOS.map((scenario) => (
                  <SelectItem key={scenario.id} value={scenario.id}>{scenario.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3 mt-4">
            {SCENARIOS.map((scenario) => {
              const active = scenario.id === draft.activeScenarioId;
              return (
                <div
                  key={scenario.id}
                  className={`rounded-md border px-3 py-3 ${
                    active
                      ? 'border-[hsl(var(--cf-lime)/0.3)] bg-[hsl(var(--cf-lime)/0.08)]'
                      : 'border-[hsl(var(--cf-border-subtle))] bg-[hsl(var(--cf-raised))]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-[hsl(var(--cf-text))]">{scenario.title}</p>
                      <p className="text-xs text-[hsl(var(--cf-text-muted))] mt-1">{scenario.description}</p>
                    </div>
                    {active && <CheckCircle2 className="w-4 h-4 text-[hsl(var(--cf-lime))]" />}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {scenario.roles.map((role) => (
                      <span key={role} className="cf-role-badge" data-role={role}>{role}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Section
          icon={<Bot className="w-4 h-4" />}
          title="Accountable Agents"
          subtitle="Enable agent roles, but keep named human checkpoints intact."
        >
          <div className="space-y-3">
            {ACCOUNTABLE_AGENTS.map((agent) => {
              const enabled = draft.enabledAgentIds.includes(agent.id);
              return (
                <div key={agent.id} className="rounded-md border border-[hsl(var(--cf-border-subtle))] bg-[hsl(var(--cf-raised))] px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-[hsl(var(--cf-text))]">{agent.name}</p>
                        <span className="cf-role-badge" data-role={agent.ownerRole}>{agent.ownerRole}</span>
                      </div>
                      <p className="text-xs text-[hsl(var(--cf-text-muted))] mt-1">{agent.summary}</p>
                      <p className="text-[11px] text-[hsl(var(--cf-text-secondary))] mt-2">
                        {agent.automationLabel} · {agent.humanCheckpoint}
                      </p>
                    </div>
                    <Switch checked={enabled} onCheckedChange={() => handleAgentToggle(agent.id)} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex justify-end">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={saveAgents}>
              <Save className="w-3.5 h-3.5" /> Save Agent Roster
            </Button>
          </div>
        </Section>

        <Section
          icon={<ShieldCheck className="w-4 h-4" />}
          title="Automation Policy"
          subtitle="Define when the system can create work, escalate, or wait for human signoff."
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-md border border-[hsl(var(--cf-border-subtle))] bg-[hsl(var(--cf-raised))] px-3 py-3">
              <div>
                <p className="text-sm font-medium text-[hsl(var(--cf-text))]">Auto-create tasks</p>
                <p className="text-xs text-[hsl(var(--cf-text-muted))]">Turn workflow and reporting findings into queue items automatically.</p>
              </div>
              <Switch checked={draft.autoCreateTasks} onCheckedChange={(checked) => updateDraft('autoCreateTasks', checked)} />
            </div>
            <div className="flex items-center justify-between rounded-md border border-[hsl(var(--cf-border-subtle))] bg-[hsl(var(--cf-raised))] px-3 py-3">
              <div>
                <p className="text-sm font-medium text-[hsl(var(--cf-text))]">Auto-escalate approvals</p>
                <p className="text-xs text-[hsl(var(--cf-text-muted))]">Escalate stale requests to the named human lead.</p>
              </div>
              <Switch checked={draft.autoEscalateApprovals} onCheckedChange={(checked) => updateDraft('autoEscalateApprovals', checked)} />
            </div>
            <div className="flex items-center justify-between rounded-md border border-[hsl(var(--cf-border-subtle))] bg-[hsl(var(--cf-raised))] px-3 py-3">
              <div>
                <p className="text-sm font-medium text-[hsl(var(--cf-text))]">Require human approval</p>
                <p className="text-xs text-[hsl(var(--cf-text-muted))]">Keep a named person accountable for high-risk actions.</p>
              </div>
              <Switch checked={draft.requireHumanApproval} onCheckedChange={(checked) => updateDraft('requireHumanApproval', checked)} />
            </div>
          </div>

          <div className="mt-4 rounded-md border border-dashed border-[hsl(var(--cf-border-active))] px-3 py-3">
            <p className="text-[11px] uppercase tracking-[0.08em] text-[hsl(var(--cf-text-muted))]">Current posture</p>
            <div className="flex flex-wrap gap-2 mt-3">
              <Badge variant="outline">{draft.automationMode}</Badge>
              <Badge variant="outline">{draft.digestCadence} digest</Badge>
              <Badge variant="outline">{draft.enabledAgentIds.length} agents enabled</Badge>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
