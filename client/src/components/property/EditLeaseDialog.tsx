import { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useUpdateLease, type Lease } from '@/hooks/use-property';

interface EditLeaseDialogProps {
  propertyId: string;
  lease: Lease;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function EditLeaseDialog({ propertyId, lease, open, onOpenChange }: EditLeaseDialogProps) {
  const [form, setForm] = useState({
    tenantName: '',
    tenantEmail: '',
    tenantPhone: '',
    startDate: '',
    endDate: '',
    monthlyRent: '',
    securityDeposit: '',
    status: 'active',
  });
  const { toast } = useToast();
  const updateLease = useUpdateLease(propertyId, lease.id);

  useEffect(() => {
    if (open) {
      setForm({
        tenantName: lease.tenantName || '',
        tenantEmail: lease.tenantEmail || '',
        tenantPhone: lease.tenantPhone || '',
        startDate: lease.startDate?.slice(0, 10) || '',
        endDate: lease.endDate?.slice(0, 10) || '',
        monthlyRent: lease.monthlyRent || '',
        securityDeposit: lease.securityDeposit || '',
        status: lease.status || 'active',
      });
    }
  }, [open, lease]);

  function handleChange(field: keyof typeof form, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const payload: Record<string, string | undefined> = {
      tenantName: form.tenantName.trim(),
      startDate: form.startDate,
      endDate: form.endDate,
      monthlyRent: form.monthlyRent,
      status: form.status,
    };
    if (form.tenantEmail.trim()) payload.tenantEmail = form.tenantEmail.trim();
    if (form.tenantPhone.trim()) payload.tenantPhone = form.tenantPhone.trim();
    if (form.securityDeposit) payload.securityDeposit = form.securityDeposit;

    updateLease.mutate(payload, {
      onSuccess: () => {
        toast({ title: 'Lease updated', description: `Lease for ${payload.tenantName} has been saved.` });
        onOpenChange(false);
      },
      onError: (error: Error) => {
        toast({ title: 'Failed to update lease', description: error.message, variant: 'destructive' });
      },
    });
  }

  const isValid =
    form.tenantName.trim() !== '' &&
    form.startDate !== '' &&
    form.endDate !== '' &&
    form.monthlyRent !== '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5" />
            Edit Lease
          </DialogTitle>
          <DialogDescription>Update lease terms and tenant information.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-lease-tenant-name">Tenant Name *</Label>
            <Input id="edit-lease-tenant-name" placeholder="e.g. John Smith" value={form.tenantName}
              onChange={e => handleChange('tenantName', e.target.value)} required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-lease-tenant-email">Email</Label>
              <Input id="edit-lease-tenant-email" type="email" placeholder="tenant@example.com"
                value={form.tenantEmail} onChange={e => handleChange('tenantEmail', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-lease-tenant-phone">Phone</Label>
              <Input id="edit-lease-tenant-phone" type="tel" placeholder="(312) 555-0100"
                value={form.tenantPhone} onChange={e => handleChange('tenantPhone', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-lease-start">Start Date *</Label>
              <Input id="edit-lease-start" type="date" value={form.startDate}
                onChange={e => handleChange('startDate', e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-lease-end">End Date *</Label>
              <Input id="edit-lease-end" type="date" value={form.endDate}
                onChange={e => handleChange('endDate', e.target.value)} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-lease-rent">Monthly Rent *</Label>
              <Input id="edit-lease-rent" type="number" min="0" step="0.01" placeholder="0.00"
                value={form.monthlyRent} onChange={e => handleChange('monthlyRent', e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-lease-deposit">Security Deposit</Label>
              <Input id="edit-lease-deposit" type="number" min="0" step="0.01" placeholder="0.00"
                value={form.securityDeposit} onChange={e => handleChange('securityDeposit', e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-lease-status">Status</Label>
            <Select value={form.status} onValueChange={v => handleChange('status', v)}>
              <SelectTrigger id="edit-lease-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="terminated">Terminated</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}
              disabled={updateLease.isPending}>Cancel</Button>
            <Button type="submit" disabled={!isValid || updateLease.isPending}>
              {updateLease.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
