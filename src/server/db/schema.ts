/**
 * Database Schema
 *
 * SQLite schema for local development.
 * Can be migrated to PostgreSQL for production.
 */

export const schema = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),

  -- User context for AI companion
  work_context TEXT,
  interests TEXT,  -- JSON array

  -- Preferences
  preferences TEXT DEFAULT '{}'  -- JSON object
);

-- Magic links for passwordless auth
CREATE TABLE IF NOT EXISTS magic_links (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  email TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Auth sessions (login sessions, not focus sessions)
CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  last_active_at TEXT DEFAULT (datetime('now'))
);

-- Focus sessions table (renamed from sessions for clarity)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  started_at TEXT DEFAULT (datetime('now')),
  ended_at TEXT,

  -- Session details
  declared_task TEXT,
  outcome TEXT,  -- Post-session reflection
  duration_planned INTEGER,  -- in minutes
  duration_actual INTEGER,   -- in minutes
  check_in_frequency INTEGER DEFAULT 15,  -- in minutes

  -- Status: 'active', 'completed', 'abandoned'
  status TEXT DEFAULT 'active'
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  role TEXT NOT NULL,  -- 'user' or 'assistant'
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- User context items - things worth remembering
CREATE TABLE IF NOT EXISTS user_context_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  category TEXT NOT NULL,  -- 'project', 'interest', 'challenge', 'insight'
  content TEXT NOT NULL,
  last_referenced TEXT DEFAULT (datetime('now')),
  importance INTEGER DEFAULT 1,  -- 1-5 scale
  created_at TEXT DEFAULT (datetime('now'))
);

-- Notion integration
CREATE TABLE IF NOT EXISTS notion_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  access_token TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  workspace_name TEXT,
  workspace_icon TEXT,
  bot_id TEXT NOT NULL,
  connected_at TEXT DEFAULT (datetime('now')),
  last_synced_at TEXT,

  -- User-configured database mappings
  tasks_database_id TEXT,
  calendar_database_id TEXT,
  notes_database_id TEXT,
  assistant_db_id TEXT,

  UNIQUE(user_id)
);

-- Notion API call logs for full transparency
CREATE TABLE IF NOT EXISTS notion_api_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  timestamp TEXT DEFAULT (datetime('now')),

  -- Request details
  method TEXT NOT NULL,           -- GET, POST, PATCH, DELETE
  endpoint TEXT NOT NULL,         -- /v1/pages, /v1/databases/{id}/query, etc.
  request_body TEXT,              -- JSON stringified request body (if any)

  -- Response details
  status_code INTEGER NOT NULL,   -- HTTP status code
  response_body TEXT,             -- JSON stringified response (truncated if large)

  -- Context
  operation TEXT NOT NULL,        -- Human readable: "Create task", "Query tasks", "Search", etc.
  triggered_by TEXT,              -- "user_request", "proactive_check", "assistant_action"
  duration_ms INTEGER,            -- How long the request took

  -- Error tracking
  error_message TEXT,             -- If request failed

  -- Related entities
  notion_object_id TEXT,          -- ID of the page/database involved (if applicable)
  notion_object_type TEXT         -- "page", "database", "block", etc.
);

-- Google OAuth connections (Gmail, Calendar)
CREATE TABLE IF NOT EXISTS google_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TEXT NOT NULL,
  email TEXT NOT NULL,            -- Google account email
  connected_at TEXT DEFAULT (datetime('now')),
  last_synced_at TEXT,

  -- Granted scopes (stored as JSON array)
  scopes TEXT NOT NULL,

  UNIQUE(user_id)
);

-- Google API call logs for transparency (similar to Notion)
CREATE TABLE IF NOT EXISTS google_api_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  timestamp TEXT DEFAULT (datetime('now')),

  -- Request details
  method TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  request_body TEXT,

  -- Response details
  status_code INTEGER NOT NULL,
  response_body TEXT,

  -- Context
  operation TEXT NOT NULL,
  service TEXT NOT NULL,          -- 'gmail', 'calendar', 'people'
  triggered_by TEXT,
  duration_ms INTEGER,

  -- Error tracking
  error_message TEXT
);

-- Side chats for organized topic-based conversations
CREATE TABLE IF NOT EXISTS side_chats (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  topic TEXT,                           -- Brief topic description
  created_at TEXT DEFAULT (datetime('now')),
  last_message_at TEXT DEFAULT (datetime('now')),
  status TEXT DEFAULT 'active',         -- 'active', 'archived'
  pinned INTEGER DEFAULT 0,             -- Boolean: 1 = pinned
  notion_page_id TEXT,                  -- Optional link to Notion page

  -- Context for the conversation
  context TEXT                          -- JSON: any context data for this chat
);

-- Messages in side chats (separate from session messages)
CREATE TABLE IF NOT EXISTS side_chat_messages (
  id TEXT PRIMARY KEY,
  side_chat_id TEXT NOT NULL REFERENCES side_chats(id),
  role TEXT NOT NULL,                   -- 'user', 'assistant', 'system'
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),

  -- Optional metadata
  metadata TEXT                         -- JSON: tool calls, suggestions, etc.
);

-- Main chat messages (persistent chat not tied to sessions)
CREATE TABLE IF NOT EXISTS main_chat_messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL,                   -- 'user', 'assistant', 'system'
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),

  -- Link to side chat if message spawned one
  spawned_side_chat_id TEXT REFERENCES side_chats(id),

  -- Optional metadata
  metadata TEXT                         -- JSON: tool calls, context, etc.
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_context_items_user_id ON user_context_items(user_id);
CREATE INDEX IF NOT EXISTS idx_context_items_category ON user_context_items(category);
CREATE INDEX IF NOT EXISTS idx_magic_links_token ON magic_links(token);
CREATE INDEX IF NOT EXISTS idx_magic_links_email ON magic_links(email);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(token);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_notion_connections_user_id ON notion_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_notion_api_logs_user_id ON notion_api_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_notion_api_logs_timestamp ON notion_api_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_notion_api_logs_operation ON notion_api_logs(operation);
CREATE INDEX IF NOT EXISTS idx_side_chats_user_id ON side_chats(user_id);
CREATE INDEX IF NOT EXISTS idx_side_chats_status ON side_chats(status);
CREATE INDEX IF NOT EXISTS idx_side_chat_messages_chat_id ON side_chat_messages(side_chat_id);
CREATE INDEX IF NOT EXISTS idx_main_chat_messages_user_id ON main_chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_google_connections_user_id ON google_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_google_api_logs_user_id ON google_api_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_google_api_logs_timestamp ON google_api_logs(timestamp);

-- Alerts/notifications from the assistant
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),

  -- Alert details
  type TEXT NOT NULL,              -- 'email', 'calendar', 'task', 'briefing', 'reminder', 'insight'
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  priority TEXT DEFAULT 'normal',  -- 'low', 'normal', 'high', 'urgent'

  -- Status
  status TEXT DEFAULT 'unread',    -- 'unread', 'read', 'dismissed', 'actioned'
  read_at TEXT,
  dismissed_at TEXT,

  -- Source information
  source_type TEXT,                -- 'gmail', 'calendar', 'notion', 'system'
  source_id TEXT,                  -- ID of the source item (email ID, event ID, etc.)

  -- Optional action
  action_type TEXT,                -- 'open_email', 'open_event', 'open_task', 'spawn_chat', etc.
  action_data TEXT                 -- JSON with action-specific data
);

-- Daily briefings
CREATE TABLE IF NOT EXISTS briefings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),

  -- Briefing details
  date TEXT NOT NULL,              -- The date this briefing is for (YYYY-MM-DD)
  type TEXT DEFAULT 'morning',     -- 'morning', 'evening', 'weekly'

  -- Content
  summary TEXT NOT NULL,           -- AI-generated summary

  -- Raw data used to generate briefing (for transparency)
  calendar_events TEXT,            -- JSON array of events
  emails TEXT,                     -- JSON array of email summaries
  tasks TEXT,                      -- JSON array of tasks

  -- Status
  viewed_at TEXT,

  UNIQUE(user_id, date, type)
);

-- Background job tracking
CREATE TABLE IF NOT EXISTS background_checks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  check_type TEXT NOT NULL,        -- 'email', 'calendar', 'tasks'
  last_checked_at TEXT,
  last_item_id TEXT,               -- Last seen item ID (for incremental checks)
  check_interval_minutes INTEGER DEFAULT 15,
  enabled INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_alerts_user_id ON alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at);
CREATE INDEX IF NOT EXISTS idx_briefings_user_id ON briefings(user_id);
CREATE INDEX IF NOT EXISTS idx_briefings_date ON briefings(date);
CREATE INDEX IF NOT EXISTS idx_background_checks_user_id ON background_checks(user_id);
`;

// TypeScript types matching the schema
export interface User {
  id: string;
  email: string;
  name: string;
  created_at: string;
  work_context: string | null;
  interests: string | null; // JSON string
  preferences: string; // JSON string
}

export interface Session {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  declared_task: string | null;
  outcome: string | null;
  duration_planned: number | null;
  duration_actual: number | null;
  check_in_frequency: number;
  status: "active" | "completed" | "abandoned";
}

export interface Message {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface UserContextItem {
  id: string;
  user_id: string;
  category: MemoryCategory;
  content: string;
  last_referenced: string;
  importance: number;
  created_at: string;
  source?: string; // Where this memory came from (session id, manual, etc.)
}

// Memory categories for the companion to remember
export type MemoryCategory =
  | "project" // Current projects user is working on
  | "interest" // User interests and hobbies
  | "challenge" // Common challenges/blockers
  | "insight" // Insights about what works for this user
  | "distraction" // Known distractions to watch for
  | "goal" // Short or long-term goals
  | "preference" // Interaction preferences (tone, check-in style)
  | "win" // Past wins to reference for encouragement
  | "context"; // General context about user's life/work

// Parsed types with JSON fields expanded
export interface UserWithParsedFields extends Omit<User, "interests" | "preferences"> {
  interests: string[];
  preferences: {
    defaultSessionDuration?: number;
    defaultCheckInFrequency?: number;
    theme?: "light" | "dark";
  };
}

// Auth types
export interface MagicLink {
  id: string;
  user_id: string | null;
  email: string;
  token: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface AuthSession {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  created_at: string;
  last_active_at: string;
}

// Notion integration types
export interface NotionConnection {
  id: string;
  user_id: string;
  access_token: string;
  workspace_id: string;
  workspace_name: string | null;
  workspace_icon: string | null;
  bot_id: string;
  connected_at: string;
  last_synced_at: string | null;
  tasks_database_id: string | null;
  calendar_database_id: string | null;
  notes_database_id: string | null;
  assistant_db_id: string | null;
}

export interface NotionConnectionPublic {
  id: string;
  workspace_id: string;
  workspace_name: string | null;
  workspace_icon: string | null;
  connected_at: string;
  last_synced_at: string | null;
  tasks_database_id: string | null;
  calendar_database_id: string | null;
  notes_database_id: string | null;
  assistant_db_id: string | null;
}

// Notion API call log for transparency/auditing
export interface NotionApiLog {
  id: string;
  user_id: string;
  timestamp: string;

  // Request
  method: "GET" | "POST" | "PATCH" | "DELETE";
  endpoint: string;
  request_body: string | null;

  // Response
  status_code: number;
  response_body: string | null;

  // Context
  operation: string;
  triggered_by: "user_request" | "proactive_check" | "assistant_action" | "system";
  duration_ms: number | null;

  // Error
  error_message: string | null;

  // Related entities
  notion_object_id: string | null;
  notion_object_type: "page" | "database" | "block" | "user" | null;
}

// For creating new log entries
export interface NotionApiLogInput {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  endpoint: string;
  request_body?: object | null;
  status_code: number;
  response_body?: object | null;
  operation: string;
  triggered_by: "user_request" | "proactive_check" | "assistant_action" | "system";
  duration_ms?: number;
  error_message?: string;
  notion_object_id?: string;
  notion_object_type?: "page" | "database" | "block" | "user";
}

// Google OAuth integration types
export interface GoogleConnection {
  id: string;
  user_id: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  email: string;
  connected_at: string;
  last_synced_at: string | null;
  scopes: string; // JSON array
}

export interface GoogleConnectionPublic {
  id: string;
  email: string;
  connected_at: string;
  last_synced_at: string | null;
  scopes: string[];
}

export interface GoogleApiLog {
  id: string;
  user_id: string;
  timestamp: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  endpoint: string;
  request_body: string | null;
  status_code: number;
  response_body: string | null;
  operation: string;
  service: "gmail" | "calendar" | "people";
  triggered_by: "user_request" | "proactive_check" | "assistant_action" | "system";
  duration_ms: number | null;
  error_message: string | null;
}

export interface GoogleApiLogInput {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  endpoint: string;
  request_body?: object | null;
  status_code: number;
  response_body?: object | null;
  operation: string;
  service: "gmail" | "calendar" | "people";
  triggered_by: "user_request" | "proactive_check" | "assistant_action" | "system";
  duration_ms?: number;
  error_message?: string;
}

// Side chats for topic-based conversations
export interface SideChat {
  id: string;
  user_id: string;
  title: string;
  topic: string | null;
  created_at: string;
  last_message_at: string;
  status: "active" | "archived";
  pinned: number; // 0 or 1
  notion_page_id: string | null;
  context: string | null; // JSON string
}

export interface SideChatMessage {
  id: string;
  side_chat_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
  metadata: string | null; // JSON string
}

export interface MainChatMessage {
  id: string;
  user_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
  spawned_side_chat_id: string | null;
  metadata: string | null; // JSON string
}

// Input types for creating new entries
export interface SideChatInput {
  title: string;
  topic?: string;
  context?: object;
  notion_page_id?: string;
}

export interface SideChatMessageInput {
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: object;
}

export interface MainChatMessageInput {
  role: "user" | "assistant" | "system";
  content: string;
  spawned_side_chat_id?: string;
  metadata?: object;
}

// Alert types
export type AlertType = "email" | "calendar" | "task" | "briefing" | "reminder" | "insight";
export type AlertPriority = "low" | "normal" | "high" | "urgent";
export type AlertStatus = "unread" | "read" | "dismissed" | "actioned";
export type AlertSourceType = "gmail" | "calendar" | "notion" | "system";
export type AlertActionType = "open_email" | "open_event" | "open_task" | "spawn_chat" | "open_url";

export interface Alert {
  id: string;
  user_id: string;
  created_at: string;
  type: AlertType;
  title: string;
  content: string;
  priority: AlertPriority;
  status: AlertStatus;
  read_at: string | null;
  dismissed_at: string | null;
  source_type: AlertSourceType | null;
  source_id: string | null;
  action_type: AlertActionType | null;
  action_data: string | null; // JSON string
}

export interface AlertInput {
  type: AlertType;
  title: string;
  content: string;
  priority?: AlertPriority;
  source_type?: AlertSourceType;
  source_id?: string;
  action_type?: AlertActionType;
  action_data?: object;
}

// Briefing types
export type BriefingType = "morning" | "evening" | "weekly";

export interface Briefing {
  id: string;
  user_id: string;
  created_at: string;
  date: string;
  type: BriefingType;
  summary: string;
  calendar_events: string | null; // JSON string
  emails: string | null; // JSON string
  tasks: string | null; // JSON string
  viewed_at: string | null;
}

export interface BriefingInput {
  date: string;
  type: BriefingType;
  summary: string;
  calendar_events?: object[];
  emails?: object[];
  tasks?: object[];
}

// Background check types
export type BackgroundCheckType = "email" | "calendar" | "tasks";

export interface BackgroundCheck {
  id: string;
  user_id: string;
  check_type: BackgroundCheckType;
  last_checked_at: string | null;
  last_item_id: string | null;
  check_interval_minutes: number;
  enabled: number; // 0 or 1
}
