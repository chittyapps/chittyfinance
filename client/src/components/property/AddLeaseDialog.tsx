import { useState } from 'react';
import { FileText } from 'lucide-react';
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
import { useCreateLease, usePropertyUnits } from '@/hooks/use-property';

interface AddLeaseDialogProps {
  propertyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const initialFormState = {
  unitId: '',
  tenantName: '',
  tenantEmail: '',
  tenantPhone: '',
  startDate: '',
  endDate: '',
  monthlyRent: '',
  securityDeposit: '',
};

export default function AddLeaseDialog({ propertyId, open, onOpenChange }: AddLeaseDialogProps) {
  const [form, setForm] = useState(initialFormState);
  const { toast } = useToast();
  const createLease = useCreateLease(propertyId);
  const { data: units = [] } = usePropertyUnits(propertyId);

  function resetForm() {
    setForm(initialFormState);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  }

  function handleChange(field: keyof typeof form, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const payload: Record<string, string | undefined> = {
      unitId: form.unitId,
      tenantName: form.tenantName.trim(),
      startDate: form.startDate,
      endDate: form.endDate,
      monthlyRent: form.monthlyRent,
    };
    if (form.tenantEmail.trim()) payload.tenantEmail = form.tenantEmail.trim();
    if (form.tenantPhone.trim()) payload.tenantPhone = form.tenantPhone.trim();
    if (form.securityDeposit) payload.securityDeposit = form.securityDeposit;

    createLease.mutate(payload, {
      onSuccess: () => {
        toast({ title: 'Lease created', description: `Lease for ${payload.tenantName} has been created.` });
        handleOpenChange(false);
      },
      onError: (error: Error) => {
        toast({ title: 'Failed to create lease', description: error.message, variant: 'destructive' });
      },
    });
  }

  const isValid =
    form.unitId !== '' &&
    form.tenantName.trim() !== '' &&
    form.startDate !== '' &&
    form.endDate !== '' &&
    form.monthlyRent !== '';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Add Lease
          </DialogTitle>
          <DialogDescription>Create a new lease for a unit in this property.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="lease-unit">Unit *</Label>
            <Select value={form.unitId} onValueChange={v => handleChange('unitId', v)}>
              <SelectTrigger id="lease-unit">
                <SelectValue placeholder="Select unit" />
              </SelectTrigger>
              <SelectContent>
                {units.map(u => (
                  <SelectItem key={u.id} value={u.id}>
                    Unit {u.unitNumber} — {u.bedrooms}br/{u.bathrooms}ba
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {units.length === 0 && (
              <p className="text-xs text-muted-foreground">No units available. Add a unit first.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="lease-tenant-name">Tenant Name *</Label>
            <Input id="lease-tenant-name" placeholder="e.g. John Smith" value={form.tenantName}
              onChange={e => handleChange('tenantName', e.target.value)} required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="lease-tenant-email">Email</Label>
              <Input id="lease-tenant-email" type="email" placeholder="tenant@example.com"
                value={form.tenantEmail} onChange={e => handleChange('tenantEmail', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lease-tenant-phone">Phone</Label>
              <Input id="lease-tenant-phone" type="tel" placeholder="(312) 555-0100"
                value={form.tenantPhone} onChange={e => handleChange('tenantPhone', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="lease-start">Start Date *</Label>
              <Input id="lease-start" type="date" value={form.startDate}
                onChange={e => handleChange('startDate', e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lease-end">End Date *</Label>
              <Input id="lease-end" type="date" value={form.endDate}
                onChange={e => handleChange('endDate', e.target.value)} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="lease-rent">Monthly Rent *</Label>
              <Input id="lease-rent" type="number" min="0" step="0.01" placeholder="0.00"
                value={form.monthlyRent} onChange={e => handleChange('monthlyRent', e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lease-deposit">Security Deposit</Label>
              <Input id="lease-deposit" type="number" min="0" step="0.01" placeholder="0.00"
                value={form.securityDeposit} onChange={e => handleChange('securityDeposit', e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}
              disabled={createLease.isPending}>Cancel</Button>
            <Button type="submit" disabled={!isValid || createLease.isPending}>
              {createLease.isPending ? 'Creating...' : 'Add Lease'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
