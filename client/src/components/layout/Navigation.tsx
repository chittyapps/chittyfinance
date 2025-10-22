import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Home, Building2, Zap, Settings, Menu, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function Navigation() {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { href: "/", label: "Portfolio", icon: Home },
    { href: "/properties", label: "Properties", icon: Building2 },
    { href: "/automations", label: "Automations", icon: Zap },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <>
      {/* Desktop Navigation */}
      <nav className="hidden md:flex segment-control" data-testid="nav-desktop">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href}>
            <button
              className={cn(
                "segment-item flex items-center gap-2",
                location === item.href && "active"
              )}
              data-testid={`nav-link-${item.label.toLowerCase()}`}
            >
              <item.icon className="w-4 h-4" />
              <span>{item.label}</span>
            </button>
          </Link>
        ))}
      </nav>

      {/* Mobile Menu Button */}
      <Button
        variant="outline"
        size="icon"
        className="md:hidden"
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        data-testid="button-mobile-menu"
      >
        {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </Button>

      {/* Mobile Bottom Sheet */}
      {mobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="md:hidden fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Bottom Sheet */}
          <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-[24px] p-6 shadow-xl animate-slide-up">
            <div className="flex flex-col space-y-2">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href}>
                  <button
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200",
                      location === item.href
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground hover:bg-muted"
                    )}
                    onClick={() => setMobileMenuOpen(false)}
                    data-testid={`nav-mobile-${item.label.toLowerCase()}`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="font-medium">{item.label}</span>
                  </button>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
