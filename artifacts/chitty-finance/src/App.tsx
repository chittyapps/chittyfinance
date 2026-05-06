import React, { useState, useEffect, useMemo } from 'react';
import { ShieldCheck, CheckCircle2, AlertTriangle, AlertCircle, HelpCircle, FileText, Download, ChevronDown, ChevronRight, Menu } from 'lucide-react';
import { initialData, Section, AuditItem, ConfidenceLevel } from './lib/data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

function parseNumeric(val: string): number | null {
  if (!val) return null;
  const stripped = val.replace(/[\$,]/g, '').trim();
  const num = Number(stripped);
  return isNaN(num) ? null : num;
}

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
};

export default function App() {
  const [sections, setSections] = useState<Section[]>(() => {
    const saved = localStorage.getItem('chitty-finance-audit-state');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse saved state", e);
      }
    }
    return initialData;
  });

  const [activeSectionId, setActiveSectionId] = useState(initialData[0].id);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('chitty-finance-audit-state', JSON.stringify(sections));
  }, [sections]);

  const updateItem = (sectionId: string, itemId: string, updates: Partial<AuditItem>) => {
    setSections(prev => prev.map(sec => {
      if (sec.id !== sectionId) return sec;
      return {
        ...sec,
        items: sec.items.map(item => {
          if (item.id !== itemId) return item;
          return { ...item, ...updates };
        })
      };
    }));
  };

  const handleExport = () => {
    const dataStr = JSON.stringify({
      case: "Arias v. Bianchi",
      generatedAt: new Date().toISOString(),
      auditState: sections
    }, null, 2);
    
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-arias-bianchi-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Stats
  const { totalItems, checkedItems, discrepancyCount } = useMemo(() => {
    let total = 0;
    let checked = 0;
    let discrepancies = 0;

    sections.forEach(sec => {
      sec.items.forEach(item => {
        total++;
        if (item.confidence !== 'Unverified') checked++;

        if (item.confidence !== 'Unverified') {
          const wNum = parseNumeric(item.workingFig);
          const vNum = parseNumeric(item.verifiedFig);
          if (wNum !== null && vNum !== null) {
            if (Math.abs(vNum - wNum) >= 0.01) {
              discrepancies++;
            }
          }
        }
      });
    });

    return { totalItems: total, checkedItems: checked, discrepancyCount: discrepancies };
  }, [sections]);

  const progressPercent = totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0;

  const activeSection = sections.find(s => s.id === activeSectionId) || sections[0];

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden flex-col md:flex-row">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex w-[320px] flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border shrink-0 z-10">
        <div className="p-6 pb-4">
          <div className="flex items-center gap-3 mb-6 text-sidebar-primary">
            <ShieldCheck className="w-8 h-8 text-[#10b981]" />
            <h1 className="font-serif font-bold text-lg leading-tight tracking-wide">
              ChittyFinance<br/><span className="text-sidebar-foreground/70 font-sans text-xs uppercase tracking-widest font-semibold">Auditor Engine</span>
            </h1>
          </div>
          
          <div className="bg-sidebar-accent rounded-md p-4 mb-6 border border-sidebar-border">
            <div className="text-xs font-mono text-sidebar-foreground/60 mb-1">CASE</div>
            <div className="font-semibold text-sm mb-3">Arias v. Bianchi</div>
            <div className="text-xs font-mono text-sidebar-foreground/60 mb-1">MODE</div>
            <div className="font-semibold text-sm flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#f59e0b] animate-pulse"></span>
              Primary Source Tracing
            </div>
          </div>

          <div className="mb-6">
            <div className="flex justify-between text-xs font-mono mb-2">
              <span className="text-sidebar-foreground/70">VERIFICATION</span>
              <span className="font-semibold text-[#10b981]">{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} className="h-2 bg-sidebar-accent [&>div]:bg-[#10b981]" />
            <div className="flex justify-between mt-3 text-xs">
              <span className="text-sidebar-foreground/70">{checkedItems} / {totalItems} Checked</span>
              {discrepancyCount > 0 && (
                <span className="text-[#f43f5e] font-semibold flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {discrepancyCount} Discrepancies
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <div className="text-xs font-mono text-sidebar-foreground/50 mb-3 px-2">SECTIONS</div>
          <nav className="flex flex-col gap-1">
            {sections.map(sec => (
              <button
                key={sec.id}
                onClick={() => setActiveSectionId(sec.id)}
                className={`text-left px-3 py-2.5 rounded-md text-sm transition-colors flex items-center gap-2 group ${
                  activeSectionId === sec.id 
                    ? 'bg-sidebar-accent text-sidebar-primary font-medium border border-sidebar-border' 
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                }`}
              >
                <div className={`w-1.5 h-1.5 rounded-full ${activeSectionId === sec.id ? 'bg-[#10b981]' : 'bg-transparent group-hover:bg-sidebar-foreground/20'}`} />
                <span className="truncate">{sec.title}</span>
              </button>
            ))}
          </nav>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden flex flex-col bg-sidebar text-sidebar-foreground border-b border-sidebar-border z-20">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-2 text-sidebar-primary">
            <ShieldCheck className="w-6 h-6 text-[#10b981]" />
            <div className="font-serif font-bold text-sm leading-tight">
              ChittyFinance<br/><span className="text-sidebar-foreground/70 font-sans text-[10px] uppercase tracking-widest">Auditor Engine</span>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="text-sidebar-foreground">
            <Menu className="w-6 h-6" />
          </Button>
        </div>
        
        {isMobileMenuOpen && (
          <div className="p-4 border-t border-sidebar-border bg-sidebar-accent/50 animate-in slide-in-from-top-2">
            <div className="mb-4">
              <div className="flex justify-between text-xs font-mono mb-2">
                <span>Arias v. Bianchi</span>
                <span className="font-semibold text-[#10b981]">{progressPercent}% Checked</span>
              </div>
              <Progress value={progressPercent} className="h-1.5 bg-sidebar-accent [&>div]:bg-[#10b981]" />
            </div>
            <nav className="flex flex-col gap-1 max-h-[40vh] overflow-y-auto">
              {sections.map(sec => (
                <button
                  key={sec.id}
                  onClick={() => {
                    setActiveSectionId(sec.id);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`text-left px-3 py-2 rounded-md text-sm ${
                    activeSectionId === sec.id 
                      ? 'bg-sidebar text-sidebar-primary font-medium' 
                      : 'text-sidebar-foreground/70'
                  }`}
                >
                  <span className="truncate">{sec.title}</span>
                </button>
              ))}
            </nav>
          </div>
        )}
      </div>

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#F9F7F1] dark:bg-background relative">
        <header className="px-6 py-8 border-b border-border/50 bg-white/50 dark:bg-card/50 backdrop-blur-sm sticky top-0 z-10">
          <h2 className="text-2xl font-serif font-semibold text-primary mb-2">{activeSection.title}</h2>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <HelpCircle className="w-4 h-4" /> Trace each working figure to its primary source and log exact references.
          </p>
        </header>

        <div className="flex-1 overflow-y-auto p-6 scroll-smooth pb-32">
          <div className="max-w-4xl mx-auto space-y-6">
            {activeSection.items.map((item, idx) => (
              <VerificationCard 
                key={item.id} 
                item={item} 
                sectionId={activeSection.id} 
                updateItem={updateItem}
                style={{ animationDelay: `${idx * 50}ms` }}
                className="animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both"
              />
            ))}
          </div>
        </div>

        {/* Sticky Footer */}
        <footer className="absolute bottom-0 left-0 right-0 p-4 bg-white/80 dark:bg-card/80 backdrop-blur-md border-t border-border flex justify-between items-center z-10 px-6">
          <div className="text-sm font-mono text-muted-foreground hidden sm:block">
            STATE: LOCAL_STORAGE_SYNCED
          </div>
          <Button onClick={handleExport} className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-md w-full sm:w-auto">
            <Download className="w-4 h-4 mr-2" />
            Export Verified Audit Log
          </Button>
        </footer>
      </main>
    </div>
  );
}

function VerificationCard({ item, sectionId, updateItem, className, style }: { 
  item: AuditItem, 
  sectionId: string, 
  updateItem: (sid: string, id: string, updates: Partial<AuditItem>) => void,
  className?: string,
  style?: React.CSSProperties
}) {
  const wNum = parseNumeric(item.workingFig);
  const vNum = parseNumeric(item.verifiedFig);
  
  let status = "Pending Verification";
  let statusColor = "bg-[#64748b] text-white"; // slate
  let isDiscrepancy = false;
  let discrepancyAmt = 0;

  if (item.confidence === 'Unverified' || (!item.verifiedFig && item.confidence === 'Unverified')) {
    status = "Pending Verification";
    statusColor = "bg-[#64748b] text-white";
  } else {
    if (wNum !== null && vNum !== null) {
      const delta = vNum - wNum;
      if (Math.abs(delta) < 0.01) {
        status = "Verified Match";
        statusColor = "bg-[#10b981] text-white"; // emerald
      } else {
        isDiscrepancy = true;
        discrepancyAmt = delta;
        status = `Discrepancy: ${delta > 0 ? '+' : ''}${formatCurrency(delta)}`;
        statusColor = "bg-[#e11d48] text-white"; // rose
      }
    } else if (wNum === null && vNum === null) {
      status = "Source Confirmed";
      statusColor = "bg-[#10b981] text-white";
    } else {
      status = "Needs Numeric Check";
      statusColor = "bg-[#f59e0b] text-black"; // amber
    }
  }

  const needsSourcePrompt = item.confidence === 'Confirmed' && !item.sourceId.trim();

  return (
    <Card className={`overflow-hidden transition-all duration-200 border border-border shadow-sm hover:shadow-md focus-within:ring-2 focus-within:ring-primary/20 ${className}`} style={style}>
      <div className="bg-card">
        {/* Header */}
        <div className="p-4 border-b border-border/50 bg-secondary/30 flex flex-wrap gap-3 justify-between items-start">
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center gap-2 mb-1.5">
              <Badge variant="outline" className="font-mono text-xs bg-white dark:bg-black font-semibold text-primary">
                {item.id}
              </Badge>
              {item.isCritical && (
                <Badge variant="destructive" className="text-[10px] uppercase tracking-wider font-bold bg-[#e11d48]">
                  Court Filing Block
                </Badge>
              )}
            </div>
            <h3 className="font-bold text-base text-foreground leading-tight">{item.q}</h3>
            <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground font-medium">
              <FileText className="w-3.5 h-3.5" />
              Target Source: <span className="text-foreground/80">{item.targetSources}</span>
            </div>
          </div>
          <div className={`px-3 py-1.5 rounded-full text-xs font-bold font-mono tracking-tight transition-colors shadow-sm ${statusColor}`}>
            {status}
          </div>
        </div>

        {/* Note Banner */}
        {item.logicNote && (
          <div className="bg-[#fef3c7] dark:bg-[#78350f]/20 border-b border-[#fcd34d] dark:border-[#92400e]/30 px-4 py-2.5 flex items-start gap-2 text-sm text-[#92400e] dark:text-[#fcd34d]">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="font-medium">{item.logicNote}</span>
          </div>
        )}

        {/* Body */}
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-5">
            <div>
              <label className="text-xs font-mono text-muted-foreground font-semibold mb-1.5 block uppercase tracking-wider">Working Draft Figure</label>
              <div className="bg-muted px-4 py-2.5 rounded-md font-mono text-sm border border-border/50 text-foreground font-medium flex items-center justify-between">
                {item.workingFig}
                <div className="w-2 h-2 rounded-full bg-slate-300"></div>
              </div>
            </div>
            <div>
              <label className="text-xs font-mono text-muted-foreground font-semibold mb-1.5 block uppercase tracking-wider">Verified Primary Amount</label>
              <Input 
                value={item.verifiedFig}
                onChange={e => updateItem(sectionId, item.id, { verifiedFig: e.target.value })}
                placeholder="e.g. $237,500.00 or Date"
                className="font-mono text-sm bg-white dark:bg-black"
              />
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-mono text-muted-foreground font-semibold mb-1.5 block uppercase tracking-wider">Confidence</label>
                <Select 
                  value={item.confidence} 
                  onValueChange={(val: ConfidenceLevel) => updateItem(sectionId, item.id, { confidence: val })}
                >
                  <SelectTrigger className="bg-white dark:bg-black font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Unverified">Unverified</SelectItem>
                    <SelectItem value="Probable">Probable</SelectItem>
                    <SelectItem value="Confirmed">Confirmed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-mono text-muted-foreground font-semibold mb-1.5 block uppercase tracking-wider text-nowrap">Exact Source ID/Ref</label>
                <Input 
                  value={item.sourceId}
                  onChange={e => updateItem(sectionId, item.id, { sourceId: e.target.value })}
                  placeholder="Doc/Page/Line"
                  className={`font-mono text-sm bg-white dark:bg-black transition-colors ${needsSourcePrompt ? 'border-[#e11d48] ring-1 ring-[#e11d48]/20 bg-[#fff1f2] dark:bg-[#4c0519]' : ''}`}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-mono text-muted-foreground font-semibold mb-1.5 block uppercase tracking-wider">Discrepancy Notes / Action</label>
              <Textarea 
                value={item.notes}
                onChange={e => updateItem(sectionId, item.id, { notes: e.target.value })}
                placeholder={isDiscrepancy ? "Explain the discrepancy..." : "Optional context..."}
                className="resize-none h-[68px] bg-white dark:bg-black text-sm"
              />
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
