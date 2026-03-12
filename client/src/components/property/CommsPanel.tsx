import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { MessageSquare, Send, Mail, Phone } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import type { Lease } from '@/hooks/use-property';

interface CommsPanelProps {
  propertyId: string;
  leases: Lease[];
}

interface CommsLogEntry {
  id: string;
  recipientName: string;
  recipientContact: string;
  channel: 'sms' | 'email';
  template: string | null;
  body: string;
  status: string;
  sentAt: string;
}

interface CommsStatus {
  twilio: boolean;
  sendgrid: boolean;
}

const TEMPLATES = [
  { value: 'custom', label: 'Custom Message' },
  { value: 'lease_reminder_30', label: 'Lease Reminder (30 days)' },
  { value: 'lease_reminder_60', label: 'Lease Reminder (60 days)' },
  { value: 'lease_reminder_90', label: 'Lease Reminder (90 days)' },
  { value: 'maintenance_scheduled', label: 'Maintenance Scheduled' },
  { value: 'rent_receipt', label: 'Rent Receipt' },
  { value: 'questionnaire', label: 'Follow-up Questionnaire' },
] as const;

export default function CommsPanel({ propertyId, leases }: CommsPanelProps) {
  const [channel, setChannel] = useState<'sms' | 'email'>('sms');
  const [template, setTemplate] = useState('custom');
  const [recipient, setRecipient] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: status } = useQuery<CommsStatus>({
    queryKey: ['/api/comms/status'],
    staleTime: 5 * 60 * 1000,
  });

  const { data: history = [] } = useQuery<CommsLogEntry[]>({
    queryKey: [`/api/comms/history?propertyId=${propertyId}`],
  });

  const sendMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest('POST', '/api/comms/send', data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/comms/history?propertyId=${propertyId}`] });
      toast({ title: 'Message sent', description: `${channel.toUpperCase()} sent to ${recipientName || recipient}` });
      setMessage(''); setSubject('');
    },
    onError: (err: Error) => {
      toast({ title: 'Send failed', description: err.message, variant: 'destructive' });
    },
  });

  function handleSend() {
    if (!recipient || !message) return;
    sendMutation.mutate({
      channel,
      to: recipient,
      message: channel === 'email' ? message : message,
      subject: channel === 'email' ? (subject || 'ChittyFinance Notification') : undefined,
      recipientName,
      propertyId,
      template: template !== 'custom' ? template : undefined,
    });
  }

  function selectTenant(leaseId: string) {
    const lease = leases.find(l => l.id === leaseId);
    if (!lease) return;
    setRecipientName(lease.tenantName);
    if (channel === 'sms' && lease.tenantPhone) {
      setRecipient(lease.tenantPhone);
    } else if (channel === 'email' && lease.tenantEmail) {
      setRecipient(lease.tenantEmail);
    }
  }

  const configured = channel === 'sms' ? status?.twilio : status?.sendgrid;

  return (
    <div className="space-y-6">
      {/* Send Message Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> Send Message
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Channel</Label>
              <Select value={channel} onValueChange={v => setChannel(v as 'sms' | 'email')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sms"><Phone className="h-3 w-3 inline mr-1" />SMS</SelectItem>
                  <SelectItem value="email"><Mail className="h-3 w-3 inline mr-1" />Email</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Template</Label>
              <Select value={template} onValueChange={setTemplate}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Tenant Quick Select */}
          {leases.length > 0 && (
            <div className="space-y-2">
              <Label>Quick Select Tenant</Label>
              <Select onValueChange={selectTenant}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a tenant..." />
                </SelectTrigger>
                <SelectContent>
                  {leases.filter(l => l.status === 'active').map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.tenantName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Recipient Name</Label>
              <Input value={recipientName} onChange={e => setRecipientName(e.target.value)} placeholder="John Smith" />
            </div>
            <div className="space-y-2">
              <Label>{channel === 'sms' ? 'Phone Number' : 'Email Address'} *</Label>
              <Input value={recipient} onChange={e => setRecipient(e.target.value)}
                placeholder={channel === 'sms' ? '+13125550100' : 'tenant@example.com'} />
            </div>
          </div>

          {channel === 'email' && (
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject line" />
            </div>
          )}

          <div className="space-y-2">
            <Label>Message *</Label>
            <Textarea value={message} onChange={e => setMessage(e.target.value)}
              placeholder="Type your message..." rows={4} />
          </div>

          {!configured && (
            <p className="text-xs text-amber-600">
              {channel === 'sms' ? 'Twilio' : 'SendGrid'} is not configured. Set environment variables to enable.
            </p>
          )}

          <Button onClick={handleSend} disabled={!recipient || !message || sendMutation.isPending || !configured}>
            <Send className="h-4 w-4 mr-2" />
            {sendMutation.isPending ? 'Sending...' : `Send ${channel.toUpperCase()}`}
          </Button>
        </CardContent>
      </Card>

      {/* Message History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Message History</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No messages sent for this property yet.</p>
          ) : (
            <div className="space-y-3">
              {history.map(entry => (
                <div key={entry.id} className="flex items-start gap-3 text-sm border-b pb-3 last:border-0">
                  <div className="shrink-0 mt-0.5">
                    {entry.channel === 'sms' ? <Phone className="h-4 w-4 text-blue-500" /> : <Mail className="h-4 w-4 text-green-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{entry.recipientName}</span>
                      <span className="text-muted-foreground">{entry.recipientContact}</span>
                      <Badge variant={entry.status === 'sent' || entry.status === 'delivered' ? 'default' : 'destructive'} className="text-xs">
                        {entry.status}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground truncate">{entry.body}</p>
                    <p className="text-xs text-muted-foreground">{new Date(entry.sentAt).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
