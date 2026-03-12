import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import GoogleCalendarEmbed from './GoogleCalendarEmbed';
import GoogleSheetsEmbed from './GoogleSheetsEmbed';
import GoogleDriveEmbed from './GoogleDriveEmbed';

interface GoogleStatus {
  connected: boolean;
  calendarId: string | null;
  driveFolderId: string | null;
  sheetId?: string | null;
}

interface WorkspaceTabProps {
  propertyId: string;
}

export default function WorkspaceTab({ propertyId }: WorkspaceTabProps) {
  const { data: status } = useQuery<GoogleStatus>({
    queryKey: ['/api/integrations/google/status'],
    staleTime: 5 * 60 * 1000,
  });

  const connected = status?.connected ?? false;

  return (
    <div className="space-y-4">
      <Tabs defaultValue="calendar">
        <TabsList>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="mt-4">
          <GoogleCalendarEmbed
            propertyId={propertyId}
            calendarId={status?.calendarId ?? undefined}
            connected={connected}
          />
        </TabsContent>

        <TabsContent value="maintenance" className="mt-4">
          <GoogleSheetsEmbed
            propertyId={propertyId}
            sheetId={status?.sheetId ?? undefined}
            connected={connected}
          />
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <GoogleDriveEmbed
            propertyId={propertyId}
            folderId={status?.driveFolderId ?? undefined}
            connected={connected}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
