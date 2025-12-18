/**
 * Google Service
 *
 * Handles Google OAuth flow and API operations.
 * Provides access to Gmail and Google Calendar for the personal assistant.
 *
 * Setup Instructions:
 * 1. Go to https://console.cloud.google.com/
 * 2. Create a new project (or select existing)
 * 3. Enable the Gmail API and Google Calendar API:
 *    - APIs & Services > Library > Search "Gmail API" > Enable
 *    - APIs & Services > Library > Search "Google Calendar API" > Enable
 * 4. Configure OAuth consent screen:
 *    - APIs & Services > OAuth consent screen
 *    - Choose "External" user type
 *    - Fill in app name, support email, developer email
 *    - Add scopes: gmail.readonly, calendar.readonly (or calendar for write)
 *    - Add test users (your email) while in testing mode
 * 5. Create OAuth 2.0 credentials:
 *    - APIs & Services > Credentials > Create Credentials > OAuth client ID
 *    - Application type: Web application
 *    - Add authorized redirect URI: http://localhost:3001/api/google/callback
 *    - Copy the Client ID and Client Secret
 * 6. Add to your .env file:
 *    GOOGLE_CLIENT_ID=your-client-id
 *    GOOGLE_CLIENT_SECRET=your-client-secret
 *    GOOGLE_REDIRECT_URI=http://localhost:3001/api/google/callback
 */

import crypto from "node:crypto";
import { getDb } from "../db/index.js";
import type {
  GoogleConnection,
  GoogleConnectionPublic,
  GoogleApiLog,
  GoogleApiLogInput,
} from "../db/schema.js";

// Maximum size for stored request/response bodies (10KB)
const MAX_BODY_SIZE = 10 * 1024;

// Google OAuth configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ||
  `${process.env.APP_URL || "http://localhost:3001"}/api/google/callback`;

// OAuth state tokens expire after 10 minutes
const OAUTH_STATE_EXPIRY_MINUTES = 10;

// Default scopes to request
// See: https://developers.google.com/identity/protocols/oauth2/scopes
const DEFAULT_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly", // Read Gmail messages
  "https://www.googleapis.com/auth/calendar.readonly", // Read calendar
  "https://www.googleapis.com/auth/userinfo.email", // Get email address
];

// In-memory store for OAuth state tokens (maps state -> userId)
const oauthStates = new Map<string, { userId: string; expiresAt: Date }>();

// ============================================
// OAuth Flow
// ============================================

/**
 * Generate the Google OAuth authorization URL
 */
export function getGoogleAuthUrl(userId: string, scopes?: string[]): string {
  const state = crypto.randomBytes(32).toString("hex");

  oauthStates.set(state, {
    userId,
    expiresAt: new Date(Date.now() + OAUTH_STATE_EXPIRY_MINUTES * 60 * 1000),
  });

  cleanupExpiredStates();

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: (scopes || DEFAULT_SCOPES).join(" "),
    access_type: "offline", // Required to get refresh_token
    prompt: "consent", // Force consent to ensure refresh_token is returned
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Validate an OAuth state token and return the associated user ID
 */
export function validateOAuthState(state: string): string | null {
  const stateData = oauthStates.get(state);

  if (!stateData) {
    return null;
  }

  if (stateData.expiresAt < new Date()) {
    oauthStates.delete(state);
    return null;
  }

  oauthStates.delete(state);
  return stateData.userId;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
} | null> {
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Google token exchange failed:", error);
      return null;
    }

    const data = await response.json();
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      scope: data.scope,
    };
  } catch (error) {
    console.error("Google token exchange error:", error);
    return null;
  }
}

/**
 * Refresh an access token using the refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
} | null> {
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Google token refresh failed:", error);
      return null;
    }

    const data = await response.json();
    return {
      access_token: data.access_token,
      expires_in: data.expires_in,
    };
  } catch (error) {
    console.error("Google token refresh error:", error);
    return null;
  }
}

/**
 * Get user's email from Google
 */
export async function getGoogleUserEmail(accessToken: string): Promise<string | null> {
  try {
    const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.email;
  } catch (error) {
    console.error("Failed to get Google user email:", error);
    return null;
  }
}

// ============================================
// Connection Management
// ============================================

/**
 * Save a new Google connection
 */
export function saveGoogleConnection(
  userId: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
  email: string,
  scopes: string
): GoogleConnection {
  const db = getDb();
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  // Delete existing connection if any
  db.prepare(`DELETE FROM google_connections WHERE user_id = ?`).run(userId);

  db.prepare(
    `
    INSERT INTO google_connections
    (id, user_id, access_token, refresh_token, token_expires_at, email, scopes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `
  ).run(id, userId, accessToken, refreshToken, expiresAt, email, scopes);

  return db.prepare(`SELECT * FROM google_connections WHERE id = ?`).get(id) as GoogleConnection;
}

/**
 * Get Google connection for a user
 */
export function getGoogleConnection(userId: string): GoogleConnection | null {
  const db = getDb();
  return (
    (db
      .prepare(`SELECT * FROM google_connections WHERE user_id = ?`)
      .get(userId) as GoogleConnection) || null
  );
}

/**
 * Get Google connection (public fields only)
 */
export function getGoogleConnectionPublic(userId: string): GoogleConnectionPublic | null {
  const connection = getGoogleConnection(userId);
  if (!connection) return null;

  return {
    id: connection.id,
    email: connection.email,
    connected_at: connection.connected_at,
    last_synced_at: connection.last_synced_at,
    scopes: JSON.parse(connection.scopes),
  };
}

/**
 * Get a valid access token, refreshing if necessary
 */
export async function getValidAccessToken(userId: string): Promise<string | null> {
  const connection = getGoogleConnection(userId);
  if (!connection) return null;

  const expiresAt = new Date(connection.token_expires_at);
  const now = new Date();

  // Refresh if token expires in less than 5 minutes
  if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
    const refreshed = await refreshAccessToken(connection.refresh_token);
    if (!refreshed) {
      console.error("Failed to refresh Google token for user:", userId);
      return null;
    }

    // Update stored tokens
    const db = getDb();
    const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

    db.prepare(
      `UPDATE google_connections SET access_token = ?, token_expires_at = ? WHERE user_id = ?`
    ).run(refreshed.access_token, newExpiresAt, userId);

    return refreshed.access_token;
  }

  return connection.access_token;
}

/**
 * Disconnect Google from a user's account
 */
export function disconnectGoogle(userId: string): boolean {
  const db = getDb();
  const result = db.prepare(`DELETE FROM google_connections WHERE user_id = ?`).run(userId);
  return result.changes > 0;
}

/**
 * Update last synced timestamp
 */
export function updateLastSynced(userId: string): void {
  const db = getDb();
  db.prepare(
    `UPDATE google_connections SET last_synced_at = datetime('now') WHERE user_id = ?`
  ).run(userId);
}

// ============================================
// API Logging
// ============================================

/**
 * Log a Google API call
 */
export function logGoogleApiCall(userId: string, input: GoogleApiLogInput): GoogleApiLog {
  const db = getDb();
  const id = crypto.randomUUID();

  // Truncate large bodies
  let requestBody = input.request_body ? JSON.stringify(input.request_body) : null;
  let responseBody = input.response_body ? JSON.stringify(input.response_body) : null;

  if (requestBody && requestBody.length > MAX_BODY_SIZE) {
    requestBody = requestBody.substring(0, MAX_BODY_SIZE) + "...[truncated]";
  }
  if (responseBody && responseBody.length > MAX_BODY_SIZE) {
    responseBody = responseBody.substring(0, MAX_BODY_SIZE) + "...[truncated]";
  }

  db.prepare(
    `
    INSERT INTO google_api_logs
    (id, user_id, method, endpoint, request_body, status_code, response_body,
     operation, service, triggered_by, duration_ms, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    id,
    userId,
    input.method,
    input.endpoint,
    requestBody,
    input.status_code,
    responseBody,
    input.operation,
    input.service,
    input.triggered_by,
    input.duration_ms || null,
    input.error_message || null
  );

  return db.prepare(`SELECT * FROM google_api_logs WHERE id = ?`).get(id) as GoogleApiLog;
}

/**
 * Get API logs for a user
 */
export function getGoogleApiLogs(
  userId: string,
  options: { limit?: number; offset?: number; service?: string } = {}
): { logs: GoogleApiLog[]; total: number } {
  const db = getDb();
  const { limit = 50, offset = 0, service } = options;

  let query = `SELECT * FROM google_api_logs WHERE user_id = ?`;
  let countQuery = `SELECT COUNT(*) as count FROM google_api_logs WHERE user_id = ?`;
  const params: (string | number)[] = [userId];

  if (service) {
    query += ` AND service = ?`;
    countQuery += ` AND service = ?`;
    params.push(service);
  }

  query += ` ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const logs = db.prepare(query).all(...params) as GoogleApiLog[];
  const countParams = service ? [userId, service] : [userId];
  const total = (db.prepare(countQuery).get(...countParams) as { count: number }).count;

  return { logs, total };
}

// ============================================
// Gmail Operations
// ============================================

interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
  };
  internalDate?: string;
}

interface GmailThread {
  id: string;
  snippet: string;
  historyId: string;
}

/**
 * Make a Gmail API request with logging
 */
async function gmailRequest<T>(
  userId: string,
  accessToken: string,
  endpoint: string,
  options: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    body?: object;
    operation: string;
    triggeredBy: "user_request" | "proactive_check" | "assistant_action" | "system";
  }
): Promise<T | null> {
  const { method = "GET", body, operation, triggeredBy } = options;
  const startTime = Date.now();

  try {
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const responseData = await response.json();
    const duration = Date.now() - startTime;

    logGoogleApiCall(userId, {
      method,
      endpoint,
      request_body: body || null,
      status_code: response.status,
      response_body: responseData as object | null,
      operation,
      service: "gmail",
      triggered_by: triggeredBy,
      duration_ms: duration,
      error_message: response.ok ? undefined : responseData?.error?.message,
    });

    if (!response.ok) {
      console.error(`Gmail API error (${response.status}):`, responseData);
      return null;
    }

    return responseData as T;
  } catch (error) {
    const duration = Date.now() - startTime;
    logGoogleApiCall(userId, {
      method,
      endpoint,
      request_body: body || null,
      status_code: 0,
      operation,
      service: "gmail",
      triggered_by: triggeredBy,
      duration_ms: duration,
      error_message: error instanceof Error ? error.message : "Unknown error",
    });
    console.error("Gmail request error:", error);
    return null;
  }
}

/**
 * List recent emails from Gmail
 */
export async function listEmails(
  userId: string,
  options: {
    maxResults?: number;
    query?: string;
    triggeredBy?: "user_request" | "proactive_check" | "assistant_action" | "system";
  } = {}
): Promise<GmailMessage[] | null> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return null;

  const { maxResults = 10, query, triggeredBy = "user_request" } = options;

  const params = new URLSearchParams({
    maxResults: maxResults.toString(),
  });
  if (query) {
    params.set("q", query);
  }

  const response = await gmailRequest<{ messages?: Array<{ id: string }> }>(
    userId,
    accessToken,
    `/users/me/messages?${params.toString()}`,
    {
      operation: "List emails",
      triggeredBy,
    }
  );

  if (!response?.messages) return [];

  // Fetch full message details
  const messages: GmailMessage[] = [];
  for (const msg of response.messages.slice(0, maxResults)) {
    const full = await gmailRequest<GmailMessage>(
      userId,
      accessToken,
      `/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      {
        operation: "Get email details",
        triggeredBy,
      }
    );
    if (full) {
      messages.push(full);
    }
  }

  return messages;
}

/**
 * Get unread email count
 */
export async function getUnreadCount(
  userId: string,
  triggeredBy: "user_request" | "proactive_check" | "assistant_action" | "system" = "user_request"
): Promise<number | null> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return null;

  const response = await gmailRequest<{
    messages?: Array<{ id: string }>;
    resultSizeEstimate?: number;
  }>(userId, accessToken, `/users/me/messages?q=is:unread&maxResults=1`, {
    operation: "Get unread count",
    triggeredBy,
  });

  return response?.resultSizeEstimate ?? 0;
}

/**
 * Get email by ID
 */
export async function getEmail(
  userId: string,
  messageId: string,
  triggeredBy: "user_request" | "proactive_check" | "assistant_action" | "system" = "user_request"
): Promise<GmailMessage | null> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return null;

  return gmailRequest<GmailMessage>(
    userId,
    accessToken,
    `/users/me/messages/${messageId}?format=full`,
    {
      operation: "Get email",
      triggeredBy,
    }
  );
}

// ============================================
// Google Calendar Operations
// ============================================

interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  location?: string;
  attendees?: Array<{ email: string; responseStatus?: string }>;
}

/**
 * Make a Google Calendar API request with logging
 */
async function calendarRequest<T>(
  userId: string,
  accessToken: string,
  endpoint: string,
  options: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    body?: object;
    operation: string;
    triggeredBy: "user_request" | "proactive_check" | "assistant_action" | "system";
  }
): Promise<T | null> {
  const { method = "GET", body, operation, triggeredBy } = options;
  const startTime = Date.now();

  try {
    const response = await fetch(`https://www.googleapis.com/calendar/v3${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const responseData = await response.json();
    const duration = Date.now() - startTime;

    logGoogleApiCall(userId, {
      method,
      endpoint,
      request_body: body || null,
      status_code: response.status,
      response_body: responseData as object | null,
      operation,
      service: "calendar",
      triggered_by: triggeredBy,
      duration_ms: duration,
      error_message: response.ok ? undefined : responseData?.error?.message,
    });

    if (!response.ok) {
      console.error(`Calendar API error (${response.status}):`, responseData);
      return null;
    }

    return responseData as T;
  } catch (error) {
    const duration = Date.now() - startTime;
    logGoogleApiCall(userId, {
      method,
      endpoint,
      request_body: body || null,
      status_code: 0,
      operation,
      service: "calendar",
      triggered_by: triggeredBy,
      duration_ms: duration,
      error_message: error instanceof Error ? error.message : "Unknown error",
    });
    console.error("Calendar request error:", error);
    return null;
  }
}

/**
 * List upcoming calendar events
 */
export async function listCalendarEvents(
  userId: string,
  options: {
    maxResults?: number;
    timeMin?: Date;
    timeMax?: Date;
    triggeredBy?: "user_request" | "proactive_check" | "assistant_action" | "system";
  } = {}
): Promise<CalendarEvent[] | null> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return null;

  const { maxResults = 10, timeMin = new Date(), timeMax, triggeredBy = "user_request" } = options;

  const params = new URLSearchParams({
    maxResults: maxResults.toString(),
    timeMin: timeMin.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
  });

  if (timeMax) {
    params.set("timeMax", timeMax.toISOString());
  }

  const response = await calendarRequest<{ items?: CalendarEvent[] }>(
    userId,
    accessToken,
    `/calendars/primary/events?${params.toString()}`,
    {
      operation: "List calendar events",
      triggeredBy,
    }
  );

  return response?.items ?? [];
}

/**
 * Get today's calendar events
 */
export async function getTodayEvents(
  userId: string,
  triggeredBy: "user_request" | "proactive_check" | "assistant_action" | "system" = "user_request"
): Promise<CalendarEvent[] | null> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  return listCalendarEvents(userId, {
    timeMin: startOfDay,
    timeMax: endOfDay,
    maxResults: 50,
    triggeredBy,
  });
}

// ============================================
// Utility Functions
// ============================================

function cleanupExpiredStates(): void {
  const now = new Date();
  for (const [state, data] of oauthStates.entries()) {
    if (data.expiresAt < now) {
      oauthStates.delete(state);
    }
  }
}

/**
 * Check if Google credentials are configured
 */
export function isGoogleConfigured(): boolean {
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}
