import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { Plus, ClipboardList, CheckCircle, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface Workflow {
  id: string;
  type: string;
  title: string;
  description: string | null;
  requestor: string | null;
  costEstimate: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface WorkflowBoardProps {
  propertyId: string;
}

const STATUSES = ['requested', 'approved', 'in_progress', 'completed'] as const;
const STATUS_COLORS: Record<string, string> = {
  requested: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  approved: 'bg-blue-100 text-blue-800 border-blue-300',
  in_progress: 'bg-purple-100 text-purple-800 border-purple-300',
  completed: 'bg-green-100 text-green-800 border-green-300',
  rejected: 'bg-red-100 text-red-800 border-red-300',
};

const WORKFLOW_TYPES = [
  { value: 'maintenance_request', label: 'Maintenance Request' },
  { value: 'expense_approval', label: 'Expense Approval' },
  { value: 'vendor_dispatch', label: 'Vendor Dispatch' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'other', label: 'Other' },
] as const;

export default function WorkflowBoard({ propertyId }: WorkflowBoardProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: workflows = [] } = useQuery<Workflow[]>({
    queryKey: [`/api/workflows?propertyId=${propertyId}`],
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest('PATCH', `/api/workflows/${id}`, { status }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/workflows?propertyId=${propertyId}`] });
      toast({ title: 'Workflow updated' });
    },
    onError: (err: Error) => {
      toast({ title: 'Update failed', description: err.message, variant: 'destructive' });
    },
  });

  function advanceStatus(workflow: Workflow) {
    const idx = STATUSES.indexOf(workflow.status as typeof STATUSES[number]);
    if (idx < 0 || idx >= STATUSES.length - 1) return;
    const nextStatus = STATUSES[idx + 1];
    updateMutation.mutate({ id: workflow.id, status: nextStatus });
  }

  const groupedByStatus = STATUSES.map(status => ({
    status,
    label: status.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()),
    items: workflows.filter(w => w.status === status),
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <ClipboardList className="h-5 w-5" /> Approval Workflows
        </h3>
        <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Request
        </Button>
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {groupedByStatus.map(col => (
          <div key={col.status} className="space-y-2">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-medium">{col.label}</h4>
              <Badge variant="secondary" className="text-xs">{col.items.length}</Badge>
            </div>
            <div className="space-y-2 min-h-[120px] p-2 rounded-lg bg-muted/50">
              {col.items.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">None</p>
              ) : (
                col.items.map(w => (
                  <Card key={w.id} className="shadow-sm">
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium leading-tight">{w.title}</p>
                        <Badge className={`text-xs shrink-0 ${STATUS_COLORS[w.status] || ''}`}>
                          {w.type.replace('_', ' ')}
                        </Badge>
                      </div>
                      {w.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{w.description}</p>
                      )}
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{w.requestor || 'Unknown'}</span>
                        {w.costEstimate && <span>${parseFloat(w.costEstimate).toLocaleString()}</span>}
                      </div>
                      {col.status !== 'completed' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full text-xs h-7"
                          onClick={() => advanceStatus(w)}
                          disabled={updateMutation.isPending}
                        >
                          {col.status === 'requested' ? (
                            <><CheckCircle className="h-3 w-3 mr-1" />Approve</>
                          ) : (
                            <><ArrowRight className="h-3 w-3 mr-1" />Advance</>
                          )}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      <CreateWorkflowDialog
        propertyId={propertyId}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </div>
  );
}

function CreateWorkflowDialog({
  propertyId,
  open,
  onOpenChange,
}: {
  propertyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [type, setType] = useState('maintenance_request');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [requestor, setRequestor] = useState('');
  const [costEstimate, setCostEstimate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiRequest('POST', '/api/workflows', {
        propertyId,
        type,
        title,
        description: description || undefined,
        requestor: requestor || undefined,
        costEstimate: costEstimate || undefined,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/workflows?propertyId=${propertyId}`] });
      toast({ title: 'Workflow created', description: `${title} submitted.` });
      onOpenChange(false);
      setTitle(''); setDescription(''); setRequestor(''); setCostEstimate('');
    } catch (err) {
      toast({ title: 'Failed', description: String(err), variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>New Workflow Request</DialogTitle>
          <DialogDescription>Submit a maintenance request, expense approval, or other workflow.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Type *</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {WORKFLOW_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Title *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} required
              placeholder="e.g. Fix leaking faucet in Unit 2A" />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
              placeholder="Detailed description of the request..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Requestor</Label>
              <Input value={requestor} onChange={e => setRequestor(e.target.value)}
                placeholder="Name" />
            </div>
            <div className="space-y-2">
              <Label>Cost Estimate</Label>
              <Input type="number" min="0" step="0.01" value={costEstimate}
                onChange={e => setCostEstimate(e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!title || submitting}>
              {submitting ? 'Creating...' : 'Submit Request'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
