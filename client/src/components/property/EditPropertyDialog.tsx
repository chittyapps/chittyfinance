import { useState, useEffect } from 'react';
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
import { useUpdateProperty, type Property } from '@/hooks/use-property';
import { useQueryClient } from '@tanstack/react-query';
import { useTenantId } from '@/contexts/TenantContext';

interface EditPropertyDialogProps {
  property: Property;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PROPERTY_TYPES = [
  { value: 'condo', label: 'Condo' },
  { value: 'house', label: 'House' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'mixed-use', label: 'Mixed-Use' },
] as const;

export default function EditPropertyDialog({ property, open, onOpenChange }: EditPropertyDialogProps) {
  const [form, setForm] = useState({
    name: property.name,
    address: property.address,
    city: property.city,
    state: property.state,
    zip: property.zip,
    propertyType: property.propertyType,
    purchasePrice: property.purchasePrice || '',
    currentValue: property.currentValue || '',
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const tenantId = useTenantId();
  const updateProperty = useUpdateProperty(property.id);

  useEffect(() => {
    if (open) {
      setForm({
        name: property.name,
        address: property.address,
        city: property.city,
        state: property.state,
        zip: property.zip,
        propertyType: property.propertyType,
        purchasePrice: property.purchasePrice || '',
        currentValue: property.currentValue || '',
      });
    }
  }, [open, property]);

  function handleChange(field: keyof typeof form, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const payload: Record<string, string | undefined> = {
      name: form.name.trim(),
      address: form.address.trim(),
      city: form.city.trim(),
      state: form.state.trim().toUpperCase(),
      zip: form.zip.trim(),
      propertyType: form.propertyType,
    };
    if (form.purchasePrice) payload.purchasePrice = form.purchasePrice;
    if (form.currentValue) payload.currentValue = form.currentValue;

    updateProperty.mutate(payload, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/portfolio/summary', tenantId] });
        toast({ title: 'Property updated', description: `${payload.name} has been updated.` });
        onOpenChange(false);
      },
      onError: (error: Error) => {
        toast({ title: 'Failed to update property', description: error.message, variant: 'destructive' });
      },
    });
  }

  const isValid =
    form.name.trim() !== '' &&
    form.address.trim() !== '' &&
    form.city.trim() !== '' &&
    form.state.trim().length === 2 &&
    form.zip.trim() !== '' &&
    form.propertyType !== '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5" />
            Edit Property
          </DialogTitle>
          <DialogDescription>Update property details.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">Name *</Label>
            <Input id="edit-name" value={form.name}
              onChange={e => handleChange('name', e.target.value)} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-address">Address *</Label>
            <Input id="edit-address" value={form.address}
              onChange={e => handleChange('address', e.target.value)} required />
          </div>

          <div className="grid grid-cols-6 gap-3">
            <div className="col-span-3 space-y-2">
              <Label htmlFor="edit-city">City *</Label>
              <Input id="edit-city" value={form.city}
                onChange={e => handleChange('city', e.target.value)} required />
            </div>
            <div className="col-span-1 space-y-2">
              <Label htmlFor="edit-state">State *</Label>
              <Input id="edit-state" maxLength={2} value={form.state}
                onChange={e => handleChange('state', e.target.value.replace(/[^a-zA-Z]/g, '').slice(0, 2))} required />
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="edit-zip">Zip *</Label>
              <Input id="edit-zip" value={form.zip}
                onChange={e => handleChange('zip', e.target.value)} required />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-type">Property Type *</Label>
            <Select value={form.propertyType} onValueChange={v => handleChange('propertyType', v)}>
              <SelectTrigger id="edit-type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {PROPERTY_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-purchase-price">Purchase Price</Label>
              <Input id="edit-purchase-price" type="number" min="0" step="0.01" placeholder="0.00"
                value={form.purchasePrice} onChange={e => handleChange('purchasePrice', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-current-value">Current Value</Label>
              <Input id="edit-current-value" type="number" min="0" step="0.01" placeholder="0.00"
                value={form.currentValue} onChange={e => handleChange('currentValue', e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}
              disabled={updateProperty.isPending}>Cancel</Button>
            <Button type="submit" disabled={!isValid || updateProperty.isPending}>
              {updateProperty.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
