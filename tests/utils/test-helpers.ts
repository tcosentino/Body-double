/**
 * Test Helpers
 *
 * Common utilities for creating test data and making assertions.
 */

import crypto from "node:crypto";
import { getTestDb } from "./test-db.js";
import type { User, Session, AuthSession } from "../../src/server/db/schema.js";

/**
 * Create a test user
 */
export function createTestUser(overrides: Partial<User> = {}): User {
  const db = getTestDb();
  const id = overrides.id || crypto.randomUUID();
  const email = overrides.email || `test-${id.slice(0, 8)}@example.com`;
  const name = overrides.name || "Test User";

  db.prepare(
    `
    INSERT INTO users (id, email, name, work_context, interests, preferences)
    VALUES (?, ?, ?, ?, ?, ?)
  `
  ).run(
    id,
    email,
    name,
    overrides.work_context || null,
    overrides.interests || null,
    overrides.preferences || "{}"
  );

  return db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) as User;
}

/**
 * Create a test session
 */
export function createTestSession(userId: string, overrides: Partial<Session> = {}): Session {
  const db = getTestDb();
  const id = overrides.id || crypto.randomUUID();

  db.prepare(
    `
    INSERT INTO sessions (id, user_id, declared_task, duration_planned, check_in_frequency, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `
  ).run(
    id,
    userId,
    overrides.declared_task || "Test task",
    overrides.duration_planned || 25,
    overrides.check_in_frequency || 15,
    overrides.status || "active"
  );

  return db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id) as Session;
}

/**
 * Create a test auth session (login)
 */
export function createTestAuthSession(userId: string): {
  session: AuthSession;
  token: string;
} {
  const db = getTestDb();
  const id = crypto.randomUUID();
  const token = crypto.randomUUID() + crypto.randomUUID(); // 64 char token
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(
    `
    INSERT INTO auth_sessions (id, user_id, token, expires_at)
    VALUES (?, ?, ?, ?)
  `
  ).run(id, userId, token, expiresAt);

  const session = db.prepare(`SELECT * FROM auth_sessions WHERE id = ?`).get(id) as AuthSession;

  return { session, token };
}

/**
 * Create a test message
 */
export function createTestMessage(
  sessionId: string,
  role: "user" | "assistant",
  content: string
): void {
  const db = getTestDb();
  const id = crypto.randomUUID();

  db.prepare(
    `
    INSERT INTO messages (id, session_id, role, content)
    VALUES (?, ?, ?, ?)
  `
  ).run(id, sessionId, role, content);
}

/**
 * Create a test context item
 */
export function createTestContextItem(
  userId: string,
  category: string,
  content: string,
  importance: number = 1
): void {
  const db = getTestDb();
  const id = crypto.randomUUID();

  db.prepare(
    `
    INSERT INTO user_context_items (id, user_id, category, content, importance)
    VALUES (?, ?, ?, ?, ?)
  `
  ).run(id, userId, category, content, importance);
}

/**
 * Get count of records in a table
 */
export function getTableCount(table: string): number {
  const db = getTestDb();
  const result = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as {
    count: number;
  };
  return result.count;
}

/**
 * Create a full test user with auth session
 */
export function createAuthenticatedUser(userOverrides: Partial<User> = {}): {
  user: User;
  token: string;
} {
  const user = createTestUser(userOverrides);
  const { token } = createTestAuthSession(user.id);
  return { user, token };
}
