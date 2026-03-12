import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FolderOpen } from 'lucide-react';

interface GoogleDriveEmbedProps {
  propertyId: string;
  folderId?: string;
  connected: boolean;
}

export default function GoogleDriveEmbed({ folderId, connected }: GoogleDriveEmbedProps) {
  if (!connected) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <FolderOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Connect Google Workspace to manage property documents here.</p>
        </CardContent>
      </Card>
    );
  }

  const embedSrc = folderId
    ? `https://drive.google.com/embeddedfolderview?id=${folderId}#list`
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FolderOpen className="h-4 w-4" /> Property Documents
        </CardTitle>
      </CardHeader>
      <CardContent>
        {embedSrc ? (
          <iframe
            src={embedSrc}
            className="w-full h-[500px] rounded border-0"
            title="Property Documents"
          />
        ) : (
          <p className="text-sm text-muted-foreground">No Drive folder configured for this property. Create one from the Google Workspace settings.</p>
        )}
      </CardContent>
    </Card>
  );
}
