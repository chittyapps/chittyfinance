import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useCreateProperty } from '@/hooks/use-property';
import { useTenantId } from '@/contexts/TenantContext';

interface AddPropertyDialogProps {
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

const initialFormState = {
  name: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  propertyType: '',
  purchasePrice: '',
  currentValue: '',
};

export default function AddPropertyDialog({ open, onOpenChange }: AddPropertyDialogProps) {
  const [form, setForm] = useState(initialFormState);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const tenantId = useTenantId();
  const createProperty = useCreateProperty();

  function resetForm() {
    setForm(initialFormState);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      resetForm();
    }
    onOpenChange(nextOpen);
  }

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

    if (form.purchasePrice) {
      payload.purchasePrice = form.purchasePrice;
    }
    if (form.currentValue) {
      payload.currentValue = form.currentValue;
    }

    createProperty.mutate(payload, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/portfolio/summary', tenantId] });
        toast({
          title: 'Property created',
          description: `${payload.name} has been added to your portfolio.`,
        });
        handleOpenChange(false);
      },
      onError: (error: Error) => {
        toast({
          title: 'Failed to create property',
          description: error.message || 'An unexpected error occurred.',
          variant: 'destructive',
        });
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add Property
          </DialogTitle>
          <DialogDescription>
            Add a new property to your portfolio. Fill in the details below.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="property-name">Name *</Label>
            <Input
              id="property-name"
              placeholder="e.g. City Studio Condo"
              value={form.name}
              onChange={e => handleChange('name', e.target.value)}
              required
            />
          </div>

          {/* Address */}
          <div className="space-y-2">
            <Label htmlFor="property-address">Address *</Label>
            <Input
              id="property-address"
              placeholder="e.g. 550 W Surf St C211"
              value={form.address}
              onChange={e => handleChange('address', e.target.value)}
              required
            />
          </div>

          {/* City / State / Zip */}
          <div className="grid grid-cols-6 gap-3">
            <div className="col-span-3 space-y-2">
              <Label htmlFor="property-city">City *</Label>
              <Input
                id="property-city"
                placeholder="Chicago"
                value={form.city}
                onChange={e => handleChange('city', e.target.value)}
                required
              />
            </div>
            <div className="col-span-1 space-y-2">
              <Label htmlFor="property-state">State *</Label>
              <Input
                id="property-state"
                placeholder="IL"
                maxLength={2}
                value={form.state}
                onChange={e => handleChange('state', e.target.value.replace(/[^a-zA-Z]/g, '').slice(0, 2))}
                required
              />
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="property-zip">Zip *</Label>
              <Input
                id="property-zip"
                placeholder="60657"
                value={form.zip}
                onChange={e => handleChange('zip', e.target.value)}
                required
              />
            </div>
          </div>

          {/* Property Type */}
          <div className="space-y-2">
            <Label htmlFor="property-type">Property Type *</Label>
            <Select value={form.propertyType} onValueChange={v => handleChange('propertyType', v)}>
              <SelectTrigger id="property-type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {PROPERTY_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Purchase Price / Current Value */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="property-purchase-price">Purchase Price</Label>
              <Input
                id="property-purchase-price"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.purchasePrice}
                onChange={e => handleChange('purchasePrice', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="property-current-value">Current Value</Label>
              <Input
                id="property-current-value"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.currentValue}
                onChange={e => handleChange('currentValue', e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={createProperty.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!isValid || createProperty.isPending}
            >
              {createProperty.isPending ? 'Creating...' : 'Add Property'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
