/**
 * Notion Service
 *
 * Handles Notion OAuth flow and API operations.
 * The assistant uses Notion as its workspace for managing the user's tasks,
 * calendar, notes, and reminders.
 */

import crypto from "node:crypto";
import { getDb } from "../db/index.js";
import type {
  NotionConnection,
  NotionConnectionPublic,
  NotionApiLog,
  NotionApiLogInput,
} from "../db/schema.js";

// Maximum size for stored request/response bodies (10KB)
const MAX_BODY_SIZE = 10 * 1024;

// Notion OAuth configuration
const NOTION_CLIENT_ID = process.env.NOTION_CLIENT_ID || "";
const NOTION_CLIENT_SECRET = process.env.NOTION_CLIENT_SECRET || "";
const NOTION_REDIRECT_URI =
  process.env.NOTION_REDIRECT_URI ||
  `${process.env.APP_URL || "http://localhost:3001"}/api/notion/callback`;

// OAuth state tokens expire after 10 minutes
const OAUTH_STATE_EXPIRY_MINUTES = 10;

// In-memory store for OAuth state tokens (maps state -> userId)
// In production, this should be in Redis or database
const oauthStates = new Map<string, { userId: string; expiresAt: Date }>();

/**
 * Generate the Notion OAuth authorization URL
 */
export function getNotionAuthUrl(userId: string): string {
  // Generate a random state token for CSRF protection
  const state = crypto.randomBytes(32).toString("hex");

  // Store the state with the user ID
  oauthStates.set(state, {
    userId,
    expiresAt: new Date(Date.now() + OAUTH_STATE_EXPIRY_MINUTES * 60 * 1000),
  });

  // Clean up expired states
  cleanupExpiredStates();

  const params = new URLSearchParams({
    client_id: NOTION_CLIENT_ID,
    redirect_uri: NOTION_REDIRECT_URI,
    response_type: "code",
    owner: "user",
    state,
  });

  return `https://api.notion.com/v1/oauth/authorize?${params.toString()}`;
}

/**
 * Validate an OAuth state token and return the associated user ID
 */
export function validateOAuthState(state: string): string | null {
  const stateData = oauthStates.get(state);

  if (!stateData) {
    return null;
  }

  // Check expiration
  if (stateData.expiresAt < new Date()) {
    oauthStates.delete(state);
    return null;
  }

  // State is valid - remove it (one-time use)
  oauthStates.delete(state);
  return stateData.userId;
}

/**
 * Exchange an authorization code for an access token
 */
export async function exchangeCodeForToken(code: string): Promise<{
  access_token: string;
  workspace_id: string;
  workspace_name: string | null;
  workspace_icon: string | null;
  bot_id: string;
} | null> {
  try {
    // Encode credentials for Basic auth
    const credentials = Buffer.from(`${NOTION_CLIENT_ID}:${NOTION_CLIENT_SECRET}`).toString(
      "base64"
    );

    const response = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: NOTION_REDIRECT_URI,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Notion OAuth error:", error);
      return null;
    }

    const data = await response.json();

    return {
      access_token: data.access_token,
      workspace_id: data.workspace_id,
      workspace_name: data.workspace_name || null,
      workspace_icon: data.workspace_icon || null,
      bot_id: data.bot_id,
    };
  } catch (error) {
    console.error("Notion OAuth exchange error:", error);
    return null;
  }
}

/**
 * Save or update a Notion connection for a user
 */
export function saveNotionConnection(
  userId: string,
  tokenData: {
    access_token: string;
    workspace_id: string;
    workspace_name: string | null;
    workspace_icon: string | null;
    bot_id: string;
  }
): NotionConnection {
  const db = getDb();

  // Check if user already has a connection
  const existing = db.prepare("SELECT id FROM notion_connections WHERE user_id = ?").get(userId) as
    | { id: string }
    | undefined;

  if (existing) {
    // Update existing connection
    db.prepare(
      `
      UPDATE notion_connections
      SET access_token = ?,
          workspace_id = ?,
          workspace_name = ?,
          workspace_icon = ?,
          bot_id = ?,
          connected_at = datetime('now'),
          last_synced_at = NULL
      WHERE user_id = ?
    `
    ).run(
      tokenData.access_token,
      tokenData.workspace_id,
      tokenData.workspace_name,
      tokenData.workspace_icon,
      tokenData.bot_id,
      userId
    );

    return db
      .prepare("SELECT * FROM notion_connections WHERE user_id = ?")
      .get(userId) as NotionConnection;
  }

  // Create new connection
  const id = crypto.randomUUID();
  db.prepare(
    `
    INSERT INTO notion_connections (
      id, user_id, access_token, workspace_id, workspace_name, workspace_icon, bot_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    id,
    userId,
    tokenData.access_token,
    tokenData.workspace_id,
    tokenData.workspace_name,
    tokenData.workspace_icon,
    tokenData.bot_id
  );

  return db.prepare("SELECT * FROM notion_connections WHERE id = ?").get(id) as NotionConnection;
}

/**
 * Get a user's Notion connection
 */
export function getNotionConnection(userId: string): NotionConnection | null {
  const db = getDb();
  return (
    (db
      .prepare("SELECT * FROM notion_connections WHERE user_id = ?")
      .get(userId) as NotionConnection) || null
  );
}

/**
 * Get a user's Notion connection (public fields only, no access token)
 */
export function getNotionConnectionPublic(userId: string): NotionConnectionPublic | null {
  const connection = getNotionConnection(userId);
  if (!connection) return null;

  return {
    id: connection.id,
    workspace_id: connection.workspace_id,
    workspace_name: connection.workspace_name,
    workspace_icon: connection.workspace_icon,
    connected_at: connection.connected_at,
    last_synced_at: connection.last_synced_at,
    tasks_database_id: connection.tasks_database_id,
    calendar_database_id: connection.calendar_database_id,
    notes_database_id: connection.notes_database_id,
    assistant_db_id: connection.assistant_db_id,
  };
}

/**
 * Disconnect Notion for a user
 */
export function disconnectNotion(userId: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM notion_connections WHERE user_id = ?").run(userId);
  return result.changes > 0;
}

/**
 * Update the database mappings for a user's Notion connection
 */
export function updateNotionDatabaseMappings(
  userId: string,
  mappings: {
    tasks_database_id?: string | null;
    calendar_database_id?: string | null;
    notes_database_id?: string | null;
    assistant_db_id?: string | null;
  }
): NotionConnectionPublic | null {
  const db = getDb();

  const updates: string[] = [];
  const values: (string | null)[] = [];

  if ("tasks_database_id" in mappings) {
    updates.push("tasks_database_id = ?");
    values.push(mappings.tasks_database_id ?? null);
  }
  if ("calendar_database_id" in mappings) {
    updates.push("calendar_database_id = ?");
    values.push(mappings.calendar_database_id ?? null);
  }
  if ("notes_database_id" in mappings) {
    updates.push("notes_database_id = ?");
    values.push(mappings.notes_database_id ?? null);
  }
  if ("assistant_db_id" in mappings) {
    updates.push("assistant_db_id = ?");
    values.push(mappings.assistant_db_id ?? null);
  }

  if (updates.length === 0) {
    return getNotionConnectionPublic(userId);
  }

  values.push(userId);
  db.prepare(`UPDATE notion_connections SET ${updates.join(", ")} WHERE user_id = ?`).run(
    ...values
  );

  return getNotionConnectionPublic(userId);
}

/**
 * Update the last synced timestamp
 */
export function updateLastSynced(userId: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE notion_connections SET last_synced_at = datetime('now') WHERE user_id = ?"
  ).run(userId);
}

/**
 * Clean up expired OAuth state tokens
 */
function cleanupExpiredStates(): void {
  const now = new Date();
  for (const [state, data] of oauthStates.entries()) {
    if (data.expiresAt < now) {
      oauthStates.delete(state);
    }
  }
}

// ============================================
// API Logging Functions
// ============================================

/**
 * Truncate a string to a maximum size
 */
function truncateBody(body: string | null): string | null {
  if (!body) return null;
  if (body.length <= MAX_BODY_SIZE) return body;
  return body.substring(0, MAX_BODY_SIZE) + "... [truncated]";
}

/**
 * Log a Notion API call
 */
export function logNotionApiCall(userId: string, input: NotionApiLogInput): NotionApiLog {
  const db = getDb();
  const id = crypto.randomUUID();

  const requestBody = input.request_body ? truncateBody(JSON.stringify(input.request_body)) : null;
  const responseBody = input.response_body
    ? truncateBody(JSON.stringify(input.response_body))
    : null;

  db.prepare(
    `
    INSERT INTO notion_api_logs (
      id, user_id, method, endpoint, request_body, status_code, response_body,
      operation, triggered_by, duration_ms, error_message, notion_object_id, notion_object_type
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    input.triggered_by,
    input.duration_ms ?? null,
    input.error_message ?? null,
    input.notion_object_id ?? null,
    input.notion_object_type ?? null
  );

  return db.prepare("SELECT * FROM notion_api_logs WHERE id = ?").get(id) as NotionApiLog;
}

/**
 * Get Notion API logs for a user
 */
export function getNotionApiLogs(
  userId: string,
  options: {
    limit?: number;
    offset?: number;
    operation?: string;
    startDate?: string;
    endDate?: string;
  } = {}
): { logs: NotionApiLog[]; total: number } {
  const db = getDb();
  const { limit = 50, offset = 0, operation, startDate, endDate } = options;

  let whereClause = "WHERE user_id = ?";
  const params: (string | number)[] = [userId];

  if (operation) {
    whereClause += " AND operation = ?";
    params.push(operation);
  }
  if (startDate) {
    whereClause += " AND timestamp >= ?";
    params.push(startDate);
  }
  if (endDate) {
    whereClause += " AND timestamp <= ?";
    params.push(endDate);
  }

  // Get total count
  const countResult = db
    .prepare(`SELECT COUNT(*) as count FROM notion_api_logs ${whereClause}`)
    .get(...params) as { count: number };

  // Get logs
  const logs = db
    .prepare(
      `SELECT * FROM notion_api_logs ${whereClause} ORDER BY timestamp DESC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as NotionApiLog[];

  return { logs, total: countResult.count };
}

/**
 * Get distinct operations for filtering
 */
export function getNotionApiLogOperations(userId: string): string[] {
  const db = getDb();
  const results = db
    .prepare("SELECT DISTINCT operation FROM notion_api_logs WHERE user_id = ? ORDER BY operation")
    .all(userId) as { operation: string }[];
  return results.map((r) => r.operation);
}

/**
 * Get API call statistics for a user
 */
export function getNotionApiStats(userId: string): {
  total_calls: number;
  calls_today: number;
  calls_this_week: number;
  success_rate: number;
  avg_duration_ms: number;
  by_operation: { operation: string; count: number }[];
} {
  const db = getDb();

  const totalResult = db
    .prepare("SELECT COUNT(*) as count FROM notion_api_logs WHERE user_id = ?")
    .get(userId) as { count: number };

  const todayResult = db
    .prepare(
      `SELECT COUNT(*) as count FROM notion_api_logs
       WHERE user_id = ? AND timestamp >= date('now')`
    )
    .get(userId) as { count: number };

  const weekResult = db
    .prepare(
      `SELECT COUNT(*) as count FROM notion_api_logs
       WHERE user_id = ? AND timestamp >= date('now', '-7 days')`
    )
    .get(userId) as { count: number };

  const successResult = db
    .prepare(
      `SELECT
         COUNT(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 END) * 100.0 / COUNT(*) as rate
       FROM notion_api_logs WHERE user_id = ?`
    )
    .get(userId) as { rate: number | null };

  const durationResult = db
    .prepare(
      `SELECT AVG(duration_ms) as avg FROM notion_api_logs
       WHERE user_id = ? AND duration_ms IS NOT NULL`
    )
    .get(userId) as { avg: number | null };

  const byOperationResult = db
    .prepare(
      `SELECT operation, COUNT(*) as count FROM notion_api_logs
       WHERE user_id = ? GROUP BY operation ORDER BY count DESC LIMIT 10`
    )
    .all(userId) as { operation: string; count: number }[];

  return {
    total_calls: totalResult.count,
    calls_today: todayResult.count,
    calls_this_week: weekResult.count,
    success_rate: successResult.rate ?? 100,
    avg_duration_ms: durationResult.avg ?? 0,
    by_operation: byOperationResult,
  };
}

/**
 * Delete old API logs (retention policy)
 */
export function cleanupOldApiLogs(daysToKeep: number = 30): number {
  const db = getDb();
  const result = db
    .prepare(`DELETE FROM notion_api_logs WHERE timestamp < date('now', '-' || ? || ' days')`)
    .run(daysToKeep);
  return result.changes;
}

// ============================================
// Notion API Client Methods
// ============================================

interface NotionRequestOptions extends Omit<RequestInit, "body"> {
  body?: object;
  operation: string;
  triggeredBy?: "user_request" | "proactive_check" | "assistant_action" | "system";
  notionObjectId?: string;
  notionObjectType?: "page" | "database" | "block" | "user";
}

/**
 * Make an authenticated request to the Notion API with full logging
 */
async function notionRequest<T>(
  userId: string,
  accessToken: string,
  endpoint: string,
  options: NotionRequestOptions
): Promise<T | null> {
  const startTime = Date.now();
  const method = (options.method || "GET") as "GET" | "POST" | "PATCH" | "DELETE";

  try {
    const response = await fetch(`https://api.notion.com/v1${endpoint}`, {
      ...options,
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const durationMs = Date.now() - startTime;
    const responseText = await response.text();
    let responseData: T | null = null;

    try {
      responseData = JSON.parse(responseText) as T;
    } catch {
      // Response wasn't JSON
    }

    // Log the API call
    logNotionApiCall(userId, {
      method,
      endpoint,
      request_body: options.body ?? null,
      status_code: response.status,
      response_body: responseData as object | null,
      operation: options.operation,
      triggered_by: options.triggeredBy ?? "system",
      duration_ms: durationMs,
      error_message: response.ok ? undefined : responseText,
      notion_object_id: options.notionObjectId,
      notion_object_type: options.notionObjectType,
    });

    if (!response.ok) {
      console.error(`Notion API error (${endpoint}):`, responseText);
      return null;
    }

    return responseData;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Log the failed call
    logNotionApiCall(userId, {
      method,
      endpoint,
      request_body: options.body ?? null,
      status_code: 0,
      response_body: null,
      operation: options.operation,
      triggered_by: options.triggeredBy ?? "system",
      duration_ms: durationMs,
      error_message: errorMessage,
      notion_object_id: options.notionObjectId,
      notion_object_type: options.notionObjectType,
    });

    console.error(`Notion API request failed (${endpoint}):`, error);
    return null;
  }
}

/**
 * Search for databases in the user's workspace
 */
export async function searchDatabases(
  userId: string
): Promise<Array<{ id: string; title: string; icon: string | null }>> {
  const connection = getNotionConnection(userId);
  if (!connection) return [];

  interface NotionSearchResponse {
    results: Array<{
      id: string;
      object: string;
      title?: Array<{ plain_text: string }>;
      icon?: { type: string; emoji?: string; external?: { url: string } } | null;
    }>;
  }

  const result = await notionRequest<NotionSearchResponse>(
    userId,
    connection.access_token,
    "/search",
    {
      method: "POST",
      body: {
        filter: { property: "object", value: "database" },
        page_size: 100,
      },
      operation: "Search databases",
      triggeredBy: "user_request",
    }
  );

  if (!result) return [];

  return result.results
    .filter((db) => db.object === "database")
    .map((db) => ({
      id: db.id,
      title: db.title?.[0]?.plain_text || "Untitled",
      icon: db.icon?.type === "emoji" ? db.icon.emoji || null : null,
    }));
}

/**
 * Get user info from Notion to verify connection is still valid
 */
export async function verifyNotionConnection(userId: string): Promise<boolean> {
  const connection = getNotionConnection(userId);
  if (!connection) return false;

  interface NotionUserResponse {
    object: string;
  }

  const result = await notionRequest<NotionUserResponse>(
    userId,
    connection.access_token,
    "/users/me",
    {
      operation: "Verify connection",
      triggeredBy: "system",
      notionObjectType: "user",
    }
  );
  return result !== null;
}

/**
 * Check if Notion OAuth is configured
 */
export function isNotionConfigured(): boolean {
  return Boolean(NOTION_CLIENT_ID && NOTION_CLIENT_SECRET);
}
