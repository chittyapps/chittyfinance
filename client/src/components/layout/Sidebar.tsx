import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  BarChart3, ArrowLeftRight, FileText, Receipt,
  Settings, Plug, Building2, Users, BookOpen, Calculator, Shield,
  ChevronDown, ChevronRight, ChevronsUpDown, Wallet,
  Menu, X, Activity
} from "lucide-react";
import { useState, useMemo } from "react";
import { useRole, type UserRole } from "@/contexts/RoleContext";
import { useTenant, type Tenant } from "@/contexts/TenantContext";

/* ─── Role-based Navigation Config ─── */
interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  roles: UserRole[];
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Portfolio", icon: Building2, roles: ["cfo", "accountant", "bookkeeper", "user"] },
  { href: "/accounts", label: "Accounts", icon: Wallet, roles: ["cfo", "accountant", "bookkeeper"] },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight, roles: ["cfo", "accountant", "bookkeeper", "user"] },
  { href: "/reports", label: "Reports", icon: BarChart3, roles: ["cfo", "accountant"] },
  { href: "/reconciliation", label: "Reconciliation", icon: Calculator, roles: ["accountant", "bookkeeper"] },
  { href: "/invoices", label: "Invoices", icon: FileText, roles: ["cfo", "accountant", "bookkeeper"] },
  { href: "/expenses", label: "Expenses", icon: Receipt, roles: ["user"] },
  { href: "/journal", label: "Journal", icon: BookOpen, roles: ["accountant"] },
  { href: "/team", label: "Team", icon: Users, roles: ["cfo"] },
  { href: "/connections", label: "Connections", icon: Plug, roles: ["cfo", "accountant"] },
  { href: "/admin", label: "Admin", icon: Shield, roles: ["cfo"] },
  { href: "/settings", label: "Settings", icon: Settings, roles: ["cfo", "accountant", "bookkeeper", "user"] },
];

/* ─── Entity Tree Data ─── */
interface EntityNode {
  id: string;
  name: string;
  shortName: string;
  type: string;
  children?: EntityNode[];
}

/** Build a tree from the flat tenants list using parentId relationships. */
function buildEntityTree(tenants: Tenant[]): EntityNode[] {
  const nodeMap = new Map<string, EntityNode>();
  const roots: EntityNode[] = [];

  // Create nodes
  for (const t of tenants) {
    const shortName = t.name.replace(/\s*LLC\s*/gi, '').replace(/^ARIBIA\s*-\s*/i, '').trim() || t.name;
    nodeMap.set(t.id, { id: t.id, name: t.name, shortName, type: t.type, children: [] });
  }

  // Build tree
  for (const t of tenants) {
    const node = nodeMap.get(t.id)!;
    if (t.parentId && nodeMap.has(t.parentId)) {
      nodeMap.get(t.parentId)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }

  // Clean up empty children arrays
  for (const node of nodeMap.values()) {
    if (node.children?.length === 0) delete node.children;
  }

  return roots;
}

function entityTypeColor(type: string): string {
  const map: Record<string, string> = {
    holding: "text-lime-400",
    personal: "text-violet-400",
    series: "text-cyan-400",
    management: "text-amber-400",
    property: "text-emerald-400",
    brand: "text-rose-400",
    vendor: "text-orange-400",
  };
  return map[type] || "text-zinc-400";
}

/* ─── Entity Tree Component ─── */
function EntityTreeNode({
  node,
  depth = 0,
  selectedId,
  onSelect,
}: {
  node: EntityNode;
  depth?: number;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedId === node.id;

  return (
    <div>
      <button
        onClick={() => {
          if (hasChildren) setExpanded(!expanded);
          onSelect(node.id);
        }}
        className={cn(
          "w-full flex items-center gap-1.5 py-1 px-1 rounded text-[11px] transition-colors group",
          isSelected
            ? "bg-[hsl(var(--cf-lime)/0.1)] text-[hsl(var(--cf-lime-bright))]"
            : "text-[hsl(var(--cf-text-secondary))] hover:text-[hsl(var(--cf-text))] hover:bg-[hsl(var(--cf-raised))]"
        )}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDown className="w-3 h-3 flex-shrink-0 opacity-50" />
          ) : (
            <ChevronRight className="w-3 h-3 flex-shrink-0 opacity-50" />
          )
        ) : (
          <span className="w-3 flex-shrink-0" />
        )}
        <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", entityTypeColor(node.type).replace("text-", "bg-"))} />
        <span className="truncate font-medium">{node.shortName}</span>
      </button>
      {hasChildren && expanded && (
        <div className="relative">
          {node.children!.map((child) => (
            <EntityTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Role Switcher ─── */
function RoleSwitcher() {
  const { currentRole, setCurrentRole, roles } = useRole();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-md bg-[hsl(var(--cf-raised))] border border-[hsl(var(--cf-border-subtle))] hover:border-[hsl(var(--cf-border-active))] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="cf-role-badge" data-role={currentRole}>
            {roles.find(r => r.id === currentRole)?.label}
          </span>
          <span className="text-xs text-[hsl(var(--cf-text-muted))]">View</span>
        </div>
        <ChevronsUpDown className="w-3 h-3 text-[hsl(var(--cf-text-muted))]" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 right-0 mb-1 z-50 bg-[hsl(var(--cf-raised))] border border-[hsl(var(--cf-border))] rounded-md shadow-xl overflow-hidden">
            {roles.map((role) => (
              <button
                key={role.id}
                onClick={() => { setCurrentRole(role.id); setOpen(false); }}
                className={cn(
                  "w-full flex flex-col px-3 py-2 text-left transition-colors",
                  currentRole === role.id
                    ? "bg-[hsl(var(--cf-lime)/0.08)]"
                    : "hover:bg-[hsl(var(--cf-overlay))]"
                )}
              >
                <span className="text-xs font-medium text-[hsl(var(--cf-text))]">{role.label}</span>
                <span className="text-[10px] text-[hsl(var(--cf-text-muted))]">{role.description}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Main Sidebar ─── */
export default function Sidebar() {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { currentRole } = useRole();
  const { currentTenant, tenants, switchTenant, isSystemMode } = useTenant();
  const [entityExpanded, setEntityExpanded] = useState(true);

  const entityTree = useMemo(() => buildEntityTree(tenants), [tenants]);
  const selectedEntity = currentTenant?.id || '';

  const handleEntitySelect = (id: string) => {
    const tenant = tenants.find(t => t.id === id);
    if (tenant) switchTenant(tenant);
  };

  const visibleNav = useMemo(
    () => NAV_ITEMS.filter((item) => item.roles.includes(currentRole)),
    [currentRole]
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        className="md:hidden fixed top-4 left-4 z-50 p-2 rounded-md bg-[hsl(var(--cf-surface))] border border-[hsl(var(--cf-border))] text-[hsl(var(--cf-text-secondary))]"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 bg-black/60 z-40" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed md:relative z-40 flex flex-col h-full w-[260px] transition-transform duration-200",
          "bg-[hsl(var(--cf-void))] border-r border-[hsl(var(--cf-border-subtle))]",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {/* Brand */}
        <div className="flex items-center h-14 px-4 border-b border-[hsl(var(--cf-border-subtle))]">
          <div className="w-7 h-7 rounded bg-lime-400 flex items-center justify-center">
            <span className="text-black font-display font-bold text-sm">CF</span>
          </div>
          <div className="ml-2.5">
            <h1 className="text-sm font-display font-semibold text-[hsl(var(--cf-text))]">
              ChittyFinance
            </h1>
            <p className="text-[10px] text-[hsl(var(--cf-text-muted))] leading-none mt-0.5">
              Financial Intelligence
            </p>
          </div>
        </div>

        {/* Entity Navigator */}
        <div className="px-3 pt-3">
          <button
            onClick={() => setEntityExpanded(!entityExpanded)}
            className="w-full flex items-center justify-between px-1 mb-1"
          >
            <span className="cf-section-title">Entities</span>
            <ChevronDown
              className={cn(
                "w-3 h-3 text-[hsl(var(--cf-text-muted))] transition-transform",
                !entityExpanded && "-rotate-90"
              )}
            />
          </button>
          {entityExpanded && (
            <div className="cf-scrollbar max-h-[200px] overflow-y-auto">
              {entityTree.map((root) => (
                <EntityTreeNode
                  key={root.id}
                  node={root}
                  selectedId={selectedEntity}
                  onSelect={handleEntitySelect}
                />
              ))}
              {entityTree.length === 0 && (
                <span className="text-[10px] text-[hsl(var(--cf-text-muted))] px-2">No entities loaded</span>
              )}
            </div>
          )}
        </div>

        {/* Separator */}
        <div className="mx-3 my-2 h-px bg-[hsl(var(--cf-border-subtle))]" />

        {/* Navigation */}
        <nav className="flex-1 px-3 overflow-y-auto cf-scrollbar">
          <div className="space-y-0.5">
            {visibleNav.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className="cf-nav-item"
                    data-active={isActive}
                    onClick={() => setMobileOpen(false)}
                  >
                    <Icon className="cf-nav-icon" />
                    <span>{item.label}</span>
                    {item.badge && (
                      <span className="ml-auto text-[10px] font-mono bg-[hsl(var(--cf-lime)/0.15)] text-[hsl(var(--cf-lime))] px-1.5 py-0.5 rounded">
                        {item.badge}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Bottom section: Role Switcher */}
        <div className="px-3 pb-3 space-y-2 border-t border-[hsl(var(--cf-border-subtle))] pt-3">
          <RoleSwitcher />

          {/* Quick system status */}
          <div className="flex items-center gap-2 px-2 py-1.5">
            <Activity className="w-3 h-3 text-emerald-400" />
            <span className="text-[10px] text-[hsl(var(--cf-text-muted))]">All systems operational</span>
          </div>
        </div>
      </aside>
    </>
  );
}
