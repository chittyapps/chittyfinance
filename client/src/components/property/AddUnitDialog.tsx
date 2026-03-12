import { useState } from 'react';
import { Home } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useCreateUnit } from '@/hooks/use-property';

interface AddUnitDialogProps {
  propertyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const initialFormState = {
  unitNumber: '',
  bedrooms: '',
  bathrooms: '',
  squareFeet: '',
  monthlyRent: '',
};

export default function AddUnitDialog({ propertyId, open, onOpenChange }: AddUnitDialogProps) {
  const [form, setForm] = useState(initialFormState);
  const { toast } = useToast();
  const createUnit = useCreateUnit(propertyId);

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

    const payload: Record<string, string | number | undefined> = {
      unitNumber: form.unitNumber.trim(),
    };
    if (form.bedrooms) payload.bedrooms = parseInt(form.bedrooms, 10);
    if (form.bathrooms) payload.bathrooms = form.bathrooms;
    if (form.squareFeet) payload.squareFeet = parseInt(form.squareFeet, 10);
    if (form.monthlyRent) payload.monthlyRent = form.monthlyRent;

    createUnit.mutate(payload, {
      onSuccess: () => {
        toast({ title: 'Unit added', description: `Unit ${payload.unitNumber} has been created.` });
        handleOpenChange(false);
      },
      onError: (error: Error) => {
        toast({ title: 'Failed to add unit', description: error.message, variant: 'destructive' });
      },
    });
  }

  const isValid = form.unitNumber.trim() !== '';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Home className="h-5 w-5" />
            Add Unit
          </DialogTitle>
          <DialogDescription>Add a new rental unit to this property.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="unit-number">Unit Number *</Label>
            <Input id="unit-number" placeholder="e.g. 1A, 201, Studio" value={form.unitNumber}
              onChange={e => handleChange('unitNumber', e.target.value)} required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="unit-beds">Bedrooms</Label>
              <Input id="unit-beds" type="number" min="0" placeholder="0" value={form.bedrooms}
                onChange={e => handleChange('bedrooms', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit-baths">Bathrooms</Label>
              <Input id="unit-baths" type="number" min="0" step="0.5" placeholder="0" value={form.bathrooms}
                onChange={e => handleChange('bathrooms', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="unit-sqft">Square Feet</Label>
              <Input id="unit-sqft" type="number" min="0" placeholder="0" value={form.squareFeet}
                onChange={e => handleChange('squareFeet', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit-rent">Monthly Rent</Label>
              <Input id="unit-rent" type="number" min="0" step="0.01" placeholder="0.00" value={form.monthlyRent}
                onChange={e => handleChange('monthlyRent', e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}
              disabled={createUnit.isPending}>Cancel</Button>
            <Button type="submit" disabled={!isValid || createUnit.isPending}>
              {createUnit.isPending ? 'Adding...' : 'Add Unit'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
