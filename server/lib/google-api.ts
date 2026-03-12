/**
 * Google API client wrapper for Calendar, Sheets, and Drive
 * Uses Google REST APIs directly (edge-compatible, no Node.js dependencies)
 */

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
].join(' ');

interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export class GoogleAPIClient {
  constructor(private config: GoogleConfig) {}

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<GoogleTokens> {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Google token exchange failed: ${err}`);
    }
    return res.json();
  }

  async refreshToken(refreshToken: string): Promise<GoogleTokens> {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Google token refresh failed: ${err}`);
    }
    return res.json();
  }
}

// Calendar API helpers
export async function listCalendarEvents(
  accessToken: string,
  calendarId: string,
  timeMin?: string,
  timeMax?: string,
) {
  const params = new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime' });
  if (timeMin) params.set('timeMin', timeMin);
  if (timeMax) params.set('timeMax', timeMax);

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error(`Calendar API error: ${res.status}`);
  return res.json();
}

export async function createCalendarEvent(
  accessToken: string,
  calendarId: string,
  event: { summary: string; description?: string; start: { dateTime: string }; end: { dateTime: string } },
) {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    },
  );
  if (!res.ok) throw new Error(`Calendar create event error: ${res.status}`);
  return res.json();
}

// Drive API helpers
export async function listDriveFiles(accessToken: string, folderId: string) {
  const q = `'${folderId}' in parents and trashed = false`;
  const params = new URLSearchParams({ q, fields: 'files(id,name,mimeType,modifiedTime,webViewLink)' });
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error(`Drive API error: ${res.status}`);
  return res.json();
}

export async function createDriveFolder(accessToken: string, name: string, parentId?: string) {
  const metadata: Record<string, unknown> = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) metadata.parents = [parentId];

  const res = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(metadata),
  });
  if (!res.ok) throw new Error(`Drive create folder error: ${res.status}`);
  return res.json();
}

/**
 * Generate embed URLs for Google Workspace assets.
 */
export function calendarEmbedUrl(calendarId: string): string {
  return `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(calendarId)}&ctz=America/Chicago`;
}

export function sheetsEmbedUrl(sheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/edit?rm=minimal`;
}

export function driveFolderEmbedUrl(folderId: string): string {
  return `https://drive.google.com/embeddedfolderview?id=${folderId}#list`;
}
