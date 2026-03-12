import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar, Plus } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface GoogleCalendarEmbedProps {
  propertyId: string;
  calendarId?: string;
  connected: boolean;
}

export default function GoogleCalendarEmbed({ propertyId, calendarId, connected }: GoogleCalendarEmbedProps) {
  const [addEventOpen, setAddEventOpen] = useState(false);

  if (!connected) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Connect Google Workspace on the Connections page to see your calendar here.</p>
        </CardContent>
      </Card>
    );
  }

  const embedSrc = calendarId
    ? `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(calendarId)}&ctz=America/Chicago`
    : `https://calendar.google.com/calendar/embed?ctz=America/Chicago`;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" /> Property Calendar
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => setAddEventOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Event
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <iframe
          src={embedSrc}
          className="w-full h-[500px] rounded border-0"
          title="Property Calendar"
        />
      </CardContent>

      <AddEventDialog
        propertyId={propertyId}
        calendarId={calendarId}
        open={addEventOpen}
        onOpenChange={setAddEventOpen}
      />
    </Card>
  );
}

function AddEventDialog({
  calendarId,
  open,
  onOpenChange,
}: {
  propertyId: string;
  calendarId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [startDateTime, setStartDateTime] = useState('');
  const [endDateTime, setEndDateTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiRequest('POST', '/api/google/calendar/events', {
        calendarId: calendarId || 'primary',
        summary,
        description,
        startDateTime: new Date(startDateTime).toISOString(),
        endDateTime: new Date(endDateTime).toISOString(),
      });
      toast({ title: 'Event created', description: `${summary} added to calendar.` });
      onOpenChange(false);
      setSummary(''); setDescription(''); setStartDateTime(''); setEndDateTime('');
    } catch (err) {
      toast({ title: 'Failed to create event', description: String(err), variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Add Calendar Event</DialogTitle>
          <DialogDescription>Create a new event on the property calendar.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Title *</Label>
            <Input value={summary} onChange={e => setSummary(e.target.value)} required placeholder="e.g. Maintenance inspection" />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional details" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Start *</Label>
              <Input type="datetime-local" value={startDateTime} onChange={e => setStartDateTime(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>End *</Label>
              <Input type="datetime-local" value={endDateTime} onChange={e => setEndDateTime(e.target.value)} required />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting || !summary || !startDateTime || !endDateTime}>
              {submitting ? 'Creating...' : 'Create Event'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
