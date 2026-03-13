export type UserRole = 'cfo' | 'accountant' | 'bookkeeper' | 'user';
export type AutomationMode = 'human-led' | 'balanced' | 'delegated';
export type DigestCadence = 'hourly' | 'daily' | 'weekly';

export interface RoleConfig {
  id: UserRole;
  label: string;
  description: string;
  headline: string;
  focusAreas: string[];
  defaultAgentIds: string[];
  defaultScenarioId: string;
}

export interface AccountableAgent {
  id: string;
  name: string;
  ownerRole: UserRole;
  summary: string;
  automationLabel: string;
  humanCheckpoint: string;
}

export interface ScenarioDefinition {
  id: string;
  title: string;
  description: string;
  trigger: string;
  outcome: string;
  roles: UserRole[];
}

export interface OperatingPreferences {
  leaderName: string;
  automationMode: AutomationMode;
  activeScenarioId: string;
  digestCadence: DigestCadence;
  autoCreateTasks: boolean;
  autoEscalateApprovals: boolean;
  requireHumanApproval: boolean;
  enabledAgentIds: string[];
}

export interface SimpleTask {
  id?: string | number;
  title: string;
  description?: string | null;
  priority?: string | null;
  status?: string | null;
  completed?: boolean | null;
  dueDate?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface SimpleWorkflow {
  id?: string | number;
  title: string;
  type?: string | null;
  status?: string | null;
  requestor?: string | null;
  costEstimate?: string | null;
}

export interface VerificationCheck {
  id: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
}

export interface FocusItem {
  id: string;
  title: string;
  detail: string;
  lane: 'approvals' | 'exceptions' | 'delegation' | 'close';
  severity: 'high' | 'medium' | 'low';
}

export interface AgentCard {
  id: string;
  name: string;
  ownerRole: UserRole;
  summary: string;
  state: 'active' | 'standby' | 'attention';
  metric: string;
  checkpoint: string;
}

export const ROLE_CONFIGS: RoleConfig[] = [
  {
    id: 'cfo',
    label: 'CFO',
    description: 'Executive oversight across entities, approvals, and close readiness.',
    headline: 'Lead the operating cadence and approve what agents cannot.',
    focusAreas: ['cash posture', 'approvals', 'cross-entity risk'],
    defaultAgentIds: ['cash-pulse', 'close-orchestrator', 'approval-sentinel'],
    defaultScenarioId: 'month-end-close',
  },
  {
    id: 'accountant',
    label: 'Accountant',
    description: 'Own reconciliation, reporting controls, and tax prep.',
    headline: 'Resolve exceptions quickly and keep the books certifiable.',
    focusAreas: ['reconciliation', 'reporting', 'tax readiness'],
    defaultAgentIds: ['reconciliation-bot', 'close-orchestrator', 'approval-sentinel'],
    defaultScenarioId: 'tax-readiness',
  },
  {
    id: 'bookkeeper',
    label: 'Bookkeeper',
    description: 'Triage transaction quality, coding, and recurring work.',
    headline: 'Keep the input layer clean so automation has something solid to run on.',
    focusAreas: ['categorization', 'transaction hygiene', 'due items'],
    defaultAgentIds: ['reconciliation-bot', 'vendor-router', 'cash-pulse'],
    defaultScenarioId: 'vendor-triage',
  },
  {
    id: 'user',
    label: 'Operator',
    description: 'Single human lead coordinating accountable agents and approvals.',
    headline: 'Run the team from one seat while preserving clear human accountability.',
    focusAreas: ['handoffs', 'approvals', 'daily operating rhythm'],
    defaultAgentIds: ['approval-sentinel', 'vendor-router', 'cash-pulse'],
    defaultScenarioId: 'daily-ops',
  },
];

export const ACCOUNTABLE_AGENTS: AccountableAgent[] = [
  {
    id: 'cash-pulse',
    name: 'Cash Pulse',
    ownerRole: 'cfo',
    summary: 'Monitors liquidity, detects burn anomalies, and drafts actions before runway changes.',
    automationLabel: 'cash anomaly watch',
    humanCheckpoint: 'Leader approves funding moves and entity transfers.',
  },
  {
    id: 'reconciliation-bot',
    name: 'Reconciliation Bot',
    ownerRole: 'accountant',
    summary: 'Clusters uncategorized activity, flags unreconciled lines, and proposes coding.',
    automationLabel: 'daily reconciliation sweep',
    humanCheckpoint: 'Accountant signs off on category changes above policy threshold.',
  },
  {
    id: 'vendor-router',
    name: 'Vendor Router',
    ownerRole: 'bookkeeper',
    summary: 'Turns workflow requests into tasks, dispatches vendors, and tracks due dates.',
    automationLabel: 'workflow to task routing',
    humanCheckpoint: 'Bookkeeper or operator approves vendor spend before release.',
  },
  {
    id: 'approval-sentinel',
    name: 'Approval Sentinel',
    ownerRole: 'user',
    summary: 'Holds approvals, escalates stale requests, and records who made the final call.',
    automationLabel: 'policy-driven escalation',
    humanCheckpoint: 'Named human leader remains final approver on escalations.',
  },
  {
    id: 'close-orchestrator',
    name: 'Close Orchestrator',
    ownerRole: 'accountant',
    summary: 'Packages report preflight findings into role-based actions for close and tax readiness.',
    automationLabel: 'close readiness packaging',
    humanCheckpoint: 'CFO confirms readiness before filing or board review.',
  },
];

export const SCENARIOS: ScenarioDefinition[] = [
  {
    id: 'month-end-close',
    title: 'Month-End Close',
    description: 'Sequence reconciliations, approvals, and entity checks into one operating run.',
    trigger: 'Last 3 business days of the month',
    outcome: 'Books closed with explicit human signoff and agent auditability.',
    roles: ['cfo', 'accountant', 'bookkeeper', 'user'],
  },
  {
    id: 'tax-readiness',
    title: 'Tax Readiness',
    description: 'Convert reporting gaps and state-level issues into assignable remediation work.',
    trigger: 'Readiness warnings or filing prep',
    outcome: 'Ready-to-file posture with a concrete remediation path if blocked.',
    roles: ['cfo', 'accountant'],
  },
  {
    id: 'vendor-triage',
    title: 'Vendor Triage',
    description: 'Handle maintenance or expense requests with queue ownership and approval policy.',
    trigger: 'New workflow requests or cost overruns',
    outcome: 'Approved, dispatched, and tracked vendor work without losing accountability.',
    roles: ['bookkeeper', 'user', 'cfo'],
  },
  {
    id: 'daily-ops',
    title: 'Daily Ops',
    description: 'Single-seat operator view for inbox, approvals, automations, and agent health.',
    trigger: 'Every workday',
    outcome: 'One human lead can supervise the operating system without blind spots.',
    roles: ['user', 'cfo', 'bookkeeper'],
  },
];

export const DEFAULT_OPERATING_PREFERENCES: OperatingPreferences = {
  leaderName: 'NB',
  automationMode: 'balanced',
  activeScenarioId: 'daily-ops',
  digestCadence: 'daily',
  autoCreateTasks: true,
  autoEscalateApprovals: true,
  requireHumanApproval: true,
  enabledAgentIds: ['cash-pulse', 'reconciliation-bot', 'approval-sentinel'],
};

export function getRoleConfig(role: UserRole): RoleConfig {
  return ROLE_CONFIGS.find((item) => item.id === role) ?? ROLE_CONFIGS[0];
}

export function getScenario(role: UserRole, scenarioId?: string): ScenarioDefinition {
  return (
    SCENARIOS.find((item) => item.id === scenarioId && item.roles.includes(role)) ??
    SCENARIOS.find((item) => item.roles.includes(role)) ??
    SCENARIOS[0]
  );
}

export function getEnabledAgentCards(args: {
  role: UserRole;
  preferences: OperatingPreferences;
  tasks: SimpleTask[];
  workflows: SimpleWorkflow[];
  integrationsConfigured: number;
  checks: VerificationCheck[];
}): AgentCard[] {
  const { role, preferences, tasks, workflows, integrationsConfigured, checks } = args;
  const highSeverityTasks = tasks.filter((task) => !task.completed && task.priority === 'urgent').length;
  const stalledApprovals = workflows.filter((workflow) => workflow.status === 'requested').length;
  const failingChecks = checks.filter((check) => check.status === 'fail').length;

  return ACCOUNTABLE_AGENTS
    .filter((agent) => preferences.enabledAgentIds.includes(agent.id))
    .map((agent) => {
      let state: AgentCard['state'] = 'active';
      let metric = `${integrationsConfigured} integrations online`;

      if (agent.id === 'approval-sentinel') {
        metric = `${stalledApprovals} approvals waiting`;
        state = stalledApprovals > 0 ? 'attention' : 'active';
      }

      if (agent.id === 'reconciliation-bot') {
        metric = `${highSeverityTasks} urgent tasks in queue`;
        state = highSeverityTasks > 0 ? 'attention' : 'active';
      }

      if (agent.id === 'close-orchestrator') {
        metric = `${failingChecks} close blockers`;
        state = failingChecks > 0 ? 'attention' : 'standby';
      }

      if (preferences.automationMode === 'human-led' && agent.ownerRole !== role) {
        state = state === 'attention' ? 'attention' : 'standby';
      }

      return {
        id: agent.id,
        name: agent.name,
        ownerRole: agent.ownerRole,
        summary: agent.summary,
        state,
        metric,
        checkpoint: agent.humanCheckpoint,
      };
    });
}

export function buildFocusQueue(args: {
  role: UserRole;
  tasks: SimpleTask[];
  workflows: SimpleWorkflow[];
  checks: VerificationCheck[];
  preferences: OperatingPreferences;
}): FocusItem[] {
  const { role, tasks, workflows, checks, preferences } = args;
  const items: FocusItem[] = [];

  const openTasks = tasks.filter((task) => !task.completed && task.status !== 'completed');
  const pendingApprovals = workflows.filter((workflow) => workflow.status === 'requested');
  const activeWorkflows = workflows.filter((workflow) => workflow.status && workflow.status !== 'completed');

  for (const check of checks.filter((item) => item.status !== 'pass').slice(0, 3)) {
    items.push({
      id: `check-${check.id}`,
      title: check.message,
      detail: check.status === 'fail' ? 'Close blocker detected' : 'Needs review before automation proceeds',
      lane: 'close',
      severity: check.status === 'fail' ? 'high' : 'medium',
    });
  }

  for (const workflow of pendingApprovals.slice(0, 2)) {
    items.push({
      id: `workflow-${workflow.id ?? workflow.title}`,
      title: workflow.title,
      detail: workflow.costEstimate
        ? `Awaiting approval · ${workflow.costEstimate}`
        : 'Awaiting approval',
      lane: 'approvals',
      severity: 'high',
    });
  }

  for (const task of openTasks.slice(0, 4)) {
    items.push({
      id: `task-${task.id ?? task.title}`,
      title: task.title,
      detail: task.description || task.status || 'Queued work item',
      lane: task.priority === 'urgent' ? 'exceptions' : 'delegation',
      severity: task.priority === 'urgent' ? 'high' : task.priority === 'due_soon' ? 'medium' : 'low',
    });
  }

  if (preferences.autoEscalateApprovals && pendingApprovals.length === 0) {
    items.push({
      id: 'delegation-check',
      title: `Keep ${getRoleConfig(role).label} delegation clean`,
      detail: `${activeWorkflows.length} workflows currently in motion`,
      lane: 'delegation',
      severity: 'low',
    });
  }

  return items.slice(0, 6);
}
