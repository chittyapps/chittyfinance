import { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useUpdateUnit, type Unit } from '@/hooks/use-property';

interface EditUnitDialogProps {
  propertyId: string;
  unit: Unit;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function EditUnitDialog({ propertyId, unit, open, onOpenChange }: EditUnitDialogProps) {
  const [form, setForm] = useState({
    unitNumber: '',
    bedrooms: '',
    bathrooms: '',
    squareFeet: '',
    monthlyRent: '',
  });
  const { toast } = useToast();
  const updateUnit = useUpdateUnit(propertyId, unit.id);

  useEffect(() => {
    if (open) {
      setForm({
        unitNumber: unit.unitNumber,
        bedrooms: String(unit.bedrooms ?? ''),
        bathrooms: String(unit.bathrooms ?? ''),
        squareFeet: String(unit.squareFeet ?? ''),
        monthlyRent: unit.monthlyRent || '',
      });
    }
  }, [open, unit]);

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

    updateUnit.mutate(payload, {
      onSuccess: () => {
        toast({ title: 'Unit updated', description: `Unit ${payload.unitNumber} has been saved.` });
        onOpenChange(false);
      },
      onError: (error: Error) => {
        toast({ title: 'Failed to update unit', description: error.message, variant: 'destructive' });
      },
    });
  }

  const isValid = form.unitNumber.trim() !== '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5" />
            Edit Unit
          </DialogTitle>
          <DialogDescription>Update unit details.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-unit-number">Unit Number *</Label>
            <Input id="edit-unit-number" placeholder="e.g. 1A, 201, Studio" value={form.unitNumber}
              onChange={e => handleChange('unitNumber', e.target.value)} required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-unit-beds">Bedrooms</Label>
              <Input id="edit-unit-beds" type="number" min="0" placeholder="0" value={form.bedrooms}
                onChange={e => handleChange('bedrooms', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-unit-baths">Bathrooms</Label>
              <Input id="edit-unit-baths" type="number" min="0" step="0.5" placeholder="0" value={form.bathrooms}
                onChange={e => handleChange('bathrooms', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-unit-sqft">Square Feet</Label>
              <Input id="edit-unit-sqft" type="number" min="0" placeholder="0" value={form.squareFeet}
                onChange={e => handleChange('squareFeet', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-unit-rent">Monthly Rent</Label>
              <Input id="edit-unit-rent" type="number" min="0" step="0.01" placeholder="0.00" value={form.monthlyRent}
                onChange={e => handleChange('monthlyRent', e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}
              disabled={updateUnit.isPending}>Cancel</Button>
            <Button type="submit" disabled={!isValid || updateUnit.isPending}>
              {updateUnit.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
