/**
 * Notion Service
 *
 * Handles Notion OAuth flow and API operations.
 * The assistant uses Notion as its workspace for managing the user's tasks,
 * calendar, notes, and reminders.
 */

import crypto from "node:crypto";
import { getDb } from "../db/index.js";
import type { NotionConnection, NotionConnectionPublic } from "../db/schema.js";

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
  const existing = db
    .prepare("SELECT id FROM notion_connections WHERE user_id = ?")
    .get(userId) as { id: string } | undefined;

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
// Notion API Client Methods
// ============================================

/**
 * Make an authenticated request to the Notion API
 */
async function notionRequest<T>(
  accessToken: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<T | null> {
  try {
    const response = await fetch(`https://api.notion.com/v1${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Notion API error (${endpoint}):`, error);
      return null;
    }

    return (await response.json()) as T;
  } catch (error) {
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
    connection.access_token,
    "/search",
    {
      method: "POST",
      body: JSON.stringify({
        filter: { property: "object", value: "database" },
        page_size: 100,
      }),
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

  const result = await notionRequest<NotionUserResponse>(connection.access_token, "/users/me");
  return result !== null;
}

/**
 * Check if Notion OAuth is configured
 */
export function isNotionConfigured(): boolean {
  return Boolean(NOTION_CLIENT_ID && NOTION_CLIENT_SECRET);
}
