import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sheet } from 'lucide-react';

interface GoogleSheetsEmbedProps {
  propertyId: string;
  sheetId?: string;
  connected: boolean;
}

export default function GoogleSheetsEmbed({ sheetId, connected }: GoogleSheetsEmbedProps) {
  if (!connected) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Sheet className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Connect Google Workspace to view maintenance logs and tracking sheets.</p>
        </CardContent>
      </Card>
    );
  }

  const embedSrc = sheetId
    ? `https://docs.google.com/spreadsheets/d/${sheetId}/edit?rm=minimal`
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Sheet className="h-4 w-4" /> Maintenance Log
        </CardTitle>
      </CardHeader>
      <CardContent>
        {embedSrc ? (
          <iframe
            src={embedSrc}
            className="w-full h-[500px] rounded border-0"
            title="Maintenance Log"
          />
        ) : (
          <p className="text-sm text-muted-foreground">No maintenance spreadsheet configured for this property. Create one in Google Sheets and link it here.</p>
        )}
      </CardContent>
    </Card>
  );
}
