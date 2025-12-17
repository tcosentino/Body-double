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
  source TEXT,  -- 'user', 'conversation', 'inferred'
  created_at TEXT DEFAULT (datetime('now'))
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
