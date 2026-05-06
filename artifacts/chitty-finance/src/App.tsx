import React, { useState, useEffect, useMemo } from 'react';
import { ShieldCheck, AlertTriangle, AlertCircle, HelpCircle, FileText, Download, Menu, Paperclip, Plus, X, Scale } from 'lucide-react';
import { initialData, Section, AuditItem, ConfidenceLevel, Classification, AuditDocument } from './lib/data';
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

const CLASS_META: Record<Classification, { label: string; short: string; color: string; bg: string; ring: string; stripe: string; chip: string }> = {
  Unclassified: { label: 'Unclassified', short: 'U', color: '#64748b', bg: 'bg-slate-100 dark:bg-slate-800', ring: 'ring-slate-300', stripe: 'bg-slate-300', chip: 'bg-slate-200 text-slate-700' },
  NonMarital:   { label: 'Non-Marital', short: 'NM', color: '#10b981', bg: 'bg-emerald-50 dark:bg-emerald-950/40', ring: 'ring-emerald-300', stripe: 'bg-emerald-500', chip: 'bg-emerald-100 text-emerald-800 border border-emerald-200' },
  Marital:      { label: 'Marital', short: 'M', color: '#0ea5e9', bg: 'bg-sky-50 dark:bg-sky-950/40', ring: 'ring-sky-300', stripe: 'bg-sky-500', chip: 'bg-sky-100 text-sky-800 border border-sky-200' },
  Disputed:     { label: 'Disputed', short: 'D', color: '#f59e0b', bg: 'bg-amber-50 dark:bg-amber-950/40', ring: 'ring-amber-300', stripe: 'bg-amber-500', chip: 'bg-amber-100 text-amber-900 border border-amber-200' },
};

const CLASS_ORDER: Classification[] = ['NonMarital', 'Marital', 'Disputed', 'Unclassified'];

function normalizeSections(secs: Section[]): Section[] {
  return secs.map(sec => ({
    ...sec,
    items: sec.items.map(item => ({
      ...item,
      classification: item.classification ?? 'Unclassified',
      documents: item.documents ?? [],
    })),
  }));
}

export default function App() {
  const [sections, setSections] = useState<Section[]>(() => {
    const saved = localStorage.getItem('chitty-finance-audit-state');
    if (saved) {
      try {
        return normalizeSections(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse saved state", e);
      }
    }
    return normalizeSections(initialData);
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
  const { totalItems, checkedItems, discrepancyCount, classCounts } = useMemo(() => {
    let total = 0;
    let checked = 0;
    let discrepancies = 0;
    const counts: Record<Classification, number> = { NonMarital: 0, Marital: 0, Disputed: 0, Unclassified: 0 };

    sections.forEach(sec => {
      sec.items.forEach(item => {
        total++;
        const cls = (item.classification ?? 'Unclassified') as Classification;
        counts[cls]++;
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

    return { totalItems: total, checkedItems: checked, discrepancyCount: discrepancies, classCounts: counts };
  }, [sections]);

  const progressPercent = totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0;
  const classifiedCount = totalItems - classCounts.Unclassified;
  const classifiedPercent = totalItems > 0 ? Math.round((classifiedCount / totalItems) * 100) : 0;

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
              Source Tracing & Classification
            </div>
          </div>

          <div className="mb-5">
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

          <div className="mb-2">
            <div className="flex justify-between text-xs font-mono mb-2">
              <span className="text-sidebar-foreground/70">CLASSIFICATION</span>
              <span className="font-semibold text-sidebar-foreground/90">{classifiedPercent}%</span>
            </div>
            <div className="flex h-2 w-full rounded-full overflow-hidden bg-sidebar-accent">
              {(['NonMarital','Marital','Disputed'] as Classification[]).map(c => {
                const pct = totalItems > 0 ? (classCounts[c] / totalItems) * 100 : 0;
                return <div key={c} style={{ width: `${pct}%`, backgroundColor: CLASS_META[c].color }} />;
              })}
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3 text-[11px]">
              {(['NonMarital','Marital','Disputed'] as Classification[]).map(c => (
                <div key={c} className="flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CLASS_META[c].color }} />
                    <span className="text-sidebar-foreground/70">{CLASS_META[c].label}</span>
                  </div>
                  <span className="font-semibold text-sm font-mono ml-3.5 text-sidebar-foreground">{classCounts[c]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 mt-2">
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
            <HelpCircle className="w-4 h-4" /> Attach primary-source documents and classify each item as Non-Marital, Marital, or Disputed.
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
  let statusColor = "bg-[#64748b] text-white";
  let isDiscrepancy = false;

  if (item.confidence === 'Unverified') {
    status = "Pending Verification";
    statusColor = "bg-[#64748b] text-white";
  } else {
    if (wNum !== null && vNum !== null) {
      const delta = vNum - wNum;
      if (Math.abs(delta) < 0.01) {
        status = "Verified Match";
        statusColor = "bg-[#10b981] text-white";
      } else {
        isDiscrepancy = true;
        status = `Discrepancy: ${delta > 0 ? '+' : ''}${formatCurrency(delta)}`;
        statusColor = "bg-[#e11d48] text-white";
      }
    } else if (wNum === null && vNum === null) {
      status = "Source Confirmed";
      statusColor = "bg-[#10b981] text-white";
    } else {
      status = "Needs Numeric Check";
      statusColor = "bg-[#f59e0b] text-black";
    }
  }

  const classification = (item.classification ?? 'Unclassified') as Classification;
  const cMeta = CLASS_META[classification];
  const documents = item.documents ?? [];
  const needsSourcePrompt = item.confidence === 'Confirmed' && !item.sourceId.trim();

  const setClassification = (c: Classification) => updateItem(sectionId, item.id, { classification: c });

  const addDocument = (name: string, ref: string, bucket: Classification) => {
    if (!name.trim()) return;
    const newDoc: AuditDocument = {
      id: `${item.id}-doc-${Date.now()}`,
      name: name.trim(),
      ref: ref.trim(),
      bucket,
    };
    updateItem(sectionId, item.id, { documents: [...documents, newDoc] });
  };

  const removeDocument = (docId: string) => {
    updateItem(sectionId, item.id, { documents: documents.filter(d => d.id !== docId) });
  };

  const setDocumentBucket = (docId: string, bucket: Classification) => {
    updateItem(sectionId, item.id, { documents: documents.map(d => d.id === docId ? { ...d, bucket } : d) });
  };

  return (
    <Card className={`overflow-hidden transition-all duration-200 border border-border shadow-sm hover:shadow-md focus-within:ring-2 focus-within:ring-primary/20 relative ${className}`} style={style}>
      {/* Classification stripe */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${cMeta.stripe} transition-colors`} />
      <div className="bg-card pl-1">
        {/* Header */}
        <div className="p-4 border-b border-border/50 bg-secondary/30 flex flex-wrap gap-3 justify-between items-start">
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <Badge variant="outline" className="font-mono text-xs bg-white dark:bg-black font-semibold text-primary">
                {item.id}
              </Badge>
              {item.isCritical && (
                <Badge variant="destructive" className="text-[10px] uppercase tracking-wider font-bold bg-[#e11d48]">
                  Court Filing Block
                </Badge>
              )}
              <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${cMeta.chip}`}>
                {cMeta.label}
              </span>
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

        {/* Classification Bar */}
        <div className="px-5 py-3 border-b border-border/50 bg-background/40 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground font-semibold uppercase tracking-wider">
            <Scale className="w-3.5 h-3.5" /> Classify
          </div>
          <div className="inline-flex rounded-md overflow-hidden border border-border bg-white dark:bg-black">
            {(['NonMarital','Marital','Disputed','Unclassified'] as Classification[]).map(c => {
              const m = CLASS_META[c];
              const active = classification === c;
              return (
                <button
                  key={c}
                  onClick={() => setClassification(c)}
                  className={`px-3 py-1.5 text-xs font-semibold transition-colors border-r last:border-r-0 border-border ${
                    active ? 'text-white' : 'text-muted-foreground hover:bg-muted'
                  }`}
                  style={active ? { backgroundColor: m.color } : undefined}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

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

        {/* Documents */}
        <DocumentsPanel
          documents={documents}
          itemClassification={classification}
          onAdd={addDocument}
          onRemove={removeDocument}
          onSetBucket={setDocumentBucket}
        />
      </div>
    </Card>
  );
}

function DocumentsPanel({
  documents,
  itemClassification,
  onAdd,
  onRemove,
  onSetBucket,
}: {
  documents: AuditDocument[];
  itemClassification: Classification;
  onAdd: (name: string, ref: string, bucket: Classification) => void;
  onRemove: (id: string) => void;
  onSetBucket: (id: string, bucket: Classification) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [ref, setRef] = useState('');
  const [bucket, setBucket] = useState<Classification>(itemClassification === 'Unclassified' ? 'NonMarital' : itemClassification);

  const submit = () => {
    if (!name.trim()) return;
    onAdd(name, ref, bucket);
    setName('');
    setRef('');
    setAdding(false);
  };

  // Group docs by bucket
  const grouped: Record<Classification, AuditDocument[]> = { NonMarital: [], Marital: [], Disputed: [], Unclassified: [] };
  documents.forEach(d => grouped[d.bucket].push(d));

  return (
    <div className="border-t border-border/50 bg-background/40">
      <div className="px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground font-semibold uppercase tracking-wider">
          <Paperclip className="w-3.5 h-3.5" /> Documents
          <span className="text-foreground/70 ml-1">({documents.length})</span>
        </div>
        {!adding && (
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setAdding(true)}>
            <Plus className="w-3.5 h-3.5" /> Add document
          </Button>
        )}
      </div>

      {adding && (
        <div className="px-5 pb-3 grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
          <div className="md:col-span-5">
            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Name</label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="USAA Wire Confirmation 10/15/2015"
              className="text-sm bg-white dark:bg-black h-9"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setAdding(false); }}
            />
          </div>
          <div className="md:col-span-3">
            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Ref</label>
            <Input
              value={ref}
              onChange={e => setRef(e.target.value)}
              placeholder="#9921 / Bates 00123"
              className="font-mono text-sm bg-white dark:bg-black h-9"
              onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setAdding(false); }}
            />
          </div>
          <div className="md:col-span-3">
            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Bucket</label>
            <Select value={bucket} onValueChange={(v: Classification) => setBucket(v)}>
              <SelectTrigger className="bg-white dark:bg-black font-medium h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NonMarital">Non-Marital</SelectItem>
                <SelectItem value="Marital">Marital</SelectItem>
                <SelectItem value="Disputed">Disputed</SelectItem>
                <SelectItem value="Unclassified">Unclassified</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-1 flex gap-1">
            <Button size="sm" className="h-9 px-3" onClick={submit}>Add</Button>
            <Button size="sm" variant="ghost" className="h-9 px-2" onClick={() => { setAdding(false); setName(''); setRef(''); }}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {documents.length > 0 && (
        <div className="px-5 pb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          {(['NonMarital', 'Marital', 'Disputed'] as Classification[]).map(b => {
            const m = CLASS_META[b];
            const list = grouped[b];
            return (
              <div key={b} className={`rounded-md border ${m.bg} border-border/60 p-2.5 min-h-[64px]`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider font-bold" style={{ color: m.color }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: m.color }} />
                    {m.label}
                  </div>
                  <span className="text-[10px] font-mono font-semibold text-muted-foreground">{list.length}</span>
                </div>
                <div className="space-y-1.5">
                  {list.length === 0 && (
                    <div className="text-[11px] text-muted-foreground/60 italic px-1">No documents</div>
                  )}
                  {list.map(d => (
                    <div key={d.id} className="bg-white dark:bg-black/40 rounded border border-border/60 px-2 py-1.5 text-xs flex items-start gap-1.5 group">
                      <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-foreground truncate">{d.name}</div>
                        {d.ref && <div className="font-mono text-[10px] text-muted-foreground truncate">{d.ref}</div>}
                      </div>
                      <Select value={d.bucket} onValueChange={(v: Classification) => onSetBucket(d.id, v)}>
                        <SelectTrigger className="h-6 px-1.5 text-[10px] w-auto border-0 bg-transparent shadow-none opacity-0 group-hover:opacity-100 transition-opacity">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NonMarital">Non-Marital</SelectItem>
                          <SelectItem value="Marital">Marital</SelectItem>
                          <SelectItem value="Disputed">Disputed</SelectItem>
                        </SelectContent>
                      </Select>
                      <button
                        onClick={() => onRemove(d.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-[#e11d48]"
                        aria-label="Remove document"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
