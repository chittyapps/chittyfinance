import { Bell, Search, Command } from "lucide-react";
import { useRole } from "@/contexts/RoleContext";
import { TenantSwitcher } from "./TenantSwitcher";

export default function Header() {
  const { currentRole, roleConfig } = useRole();
  return (
    <header className="flex items-center h-14 px-4 border-b border-[hsl(var(--cf-border-subtle))] bg-[hsl(var(--cf-void))]">
      {/* Tenant Switcher / Breadcrumb */}
      <div className="flex items-center gap-2 min-w-0">
        <TenantSwitcher />
        <span className="text-[hsl(var(--cf-text-muted))]">/</span>
        <span className="text-sm text-[hsl(var(--cf-text-secondary))] truncate">
          Overview
        </span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Search */}
      <div className="relative hidden md:block mr-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[hsl(var(--cf-surface))] border border-[hsl(var(--cf-border-subtle))] hover:border-[hsl(var(--cf-border-active))] transition-colors w-[240px]">
          <Search className="w-3.5 h-3.5 text-[hsl(var(--cf-text-muted))]" />
          <input
            type="text"
            placeholder="Search..."
            className="bg-transparent text-sm text-[hsl(var(--cf-text))] placeholder:text-[hsl(var(--cf-text-muted))] outline-none w-full"
          />
          <kbd className="hidden lg:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono text-[hsl(var(--cf-text-muted))] bg-[hsl(var(--cf-raised))] border border-[hsl(var(--cf-border-subtle))]">
            <Command className="w-2.5 h-2.5" />K
          </kbd>
        </div>
      </div>

      {/* Role Indicator */}
      <span className="cf-role-badge mr-3" data-role={currentRole}>
        {roleConfig.label}
      </span>

      {/* Notifications */}
      <button className="relative p-2 rounded-md text-[hsl(var(--cf-text-secondary))] hover:text-[hsl(var(--cf-text))] hover:bg-[hsl(var(--cf-raised))] transition-colors">
        <Bell className="w-4 h-4" />
        <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[hsl(var(--cf-rose))]" />
      </button>

      {/* User Avatar */}
      <button className="ml-2 w-8 h-8 rounded-md bg-[hsl(var(--cf-raised))] border border-[hsl(var(--cf-border-subtle))] flex items-center justify-center text-sm font-display font-semibold text-[hsl(var(--cf-lime))] hover:border-[hsl(var(--cf-lime)/0.3)] transition-colors">
        NB
      </button>
    </header>
  );
}
