/**
 * Auth Service
 *
 * Handles magic link generation, verification, and session management.
 */

import crypto from "node:crypto";
import { getDb } from "../db/index.js";
import type { User, MagicLink, AuthSession } from "../db/schema.js";

// Token expiration times
const MAGIC_LINK_EXPIRY_MINUTES = 15;
const AUTH_SESSION_EXPIRY_DAYS = 30;

/**
 * Generate a secure random token
 */
function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Create a magic link for an email address
 * If user doesn't exist, they'll be created when they verify
 */
export function createMagicLink(email: string): { token: string; isNewUser: boolean } {
  const db = getDb();
  const normalizedEmail = email.toLowerCase().trim();

  // Check if user exists
  const existingUser = db.prepare(`SELECT id FROM users WHERE email = ?`).get(normalizedEmail) as
    | { id: string }
    | undefined;

  // Generate token
  const token = generateToken();
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MINUTES * 60 * 1000).toISOString();

  // Invalidate any existing unused magic links for this email
  db.prepare(
    `
    UPDATE magic_links
    SET used_at = datetime('now')
    WHERE email = ? AND used_at IS NULL
  `
  ).run(normalizedEmail);

  // Create new magic link
  db.prepare(
    `
    INSERT INTO magic_links (id, user_id, email, token, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `
  ).run(id, existingUser?.id || null, normalizedEmail, token, expiresAt);

  return {
    token,
    isNewUser: !existingUser,
  };
}

/**
 * Verify a magic link token and create an auth session
 */
export function verifyMagicLink(
  token: string,
  name?: string
): { user: User; sessionToken: string } | null {
  const db = getDb();

  // Find the magic link
  const magicLink = db
    .prepare(
      `
    SELECT * FROM magic_links
    WHERE token = ? AND used_at IS NULL
  `
    )
    .get(token) as MagicLink | undefined;

  if (!magicLink) {
    return null; // Invalid or already used token
  }

  // Check expiration
  if (new Date(magicLink.expires_at) < new Date()) {
    return null; // Expired
  }

  // Mark as used
  db.prepare(
    `
    UPDATE magic_links SET used_at = datetime('now') WHERE id = ?
  `
  ).run(magicLink.id);

  let user: User;

  if (magicLink.user_id) {
    // Existing user
    user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(magicLink.user_id) as User;
  } else {
    // New user - create them
    const userId = crypto.randomUUID();
    const userName = name || magicLink.email.split("@")[0]; // Use email prefix as default name

    db.prepare(
      `
      INSERT INTO users (id, email, name)
      VALUES (?, ?, ?)
    `
    ).run(userId, magicLink.email, userName);

    user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId) as User;

    // Update the magic link with the new user ID
    db.prepare(`UPDATE magic_links SET user_id = ? WHERE id = ?`).run(userId, magicLink.id);
  }

  // Create auth session
  const sessionToken = generateToken();
  const sessionId = crypto.randomUUID();
  const sessionExpiresAt = new Date(
    Date.now() + AUTH_SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  db.prepare(
    `
    INSERT INTO auth_sessions (id, user_id, token, expires_at)
    VALUES (?, ?, ?, ?)
  `
  ).run(sessionId, user.id, sessionToken, sessionExpiresAt);

  return { user, sessionToken };
}

/**
 * Validate an auth session token and return the user
 */
export function validateSession(token: string): User | null {
  const db = getDb();

  const session = db
    .prepare(
      `
    SELECT * FROM auth_sessions
    WHERE token = ? AND expires_at > datetime('now')
  `
    )
    .get(token) as AuthSession | undefined;

  if (!session) {
    return null;
  }

  // Update last active time
  db.prepare(
    `
    UPDATE auth_sessions SET last_active_at = datetime('now') WHERE id = ?
  `
  ).run(session.id);

  // Get user
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(session.user_id) as User;

  return user;
}

/**
 * Invalidate an auth session (logout)
 */
export function invalidateSession(token: string): boolean {
  const db = getDb();

  const result = db
    .prepare(
      `
    DELETE FROM auth_sessions WHERE token = ?
  `
    )
    .run(token);

  return result.changes > 0;
}

/**
 * Invalidate all sessions for a user (logout everywhere)
 */
export function invalidateAllUserSessions(userId: string): number {
  const db = getDb();

  const result = db
    .prepare(
      `
    DELETE FROM auth_sessions WHERE user_id = ?
  `
    )
    .run(userId);

  return result.changes;
}

/**
 * Clean up expired tokens and sessions
 */
export function cleanupExpiredAuth(): { magicLinks: number; sessions: number } {
  const db = getDb();

  const magicLinksResult = db
    .prepare(
      `
    DELETE FROM magic_links WHERE expires_at < datetime('now')
  `
    )
    .run();

  const sessionsResult = db
    .prepare(
      `
    DELETE FROM auth_sessions WHERE expires_at < datetime('now')
  `
    )
    .run();

  return {
    magicLinks: magicLinksResult.changes,
    sessions: sessionsResult.changes,
  };
}

/**
 * Generate the magic link URL
 */
export function getMagicLinkUrl(token: string, baseUrl?: string): string {
  const base = baseUrl || process.env.APP_URL || "http://localhost:3000";
  return `${base}/auth/verify?token=${token}`;
}

/**
 * Send magic link (logs to console in dev, would email in production)
 */
export function sendMagicLink(email: string, token: string): void {
  const url = getMagicLinkUrl(token);

  // In production, this would send an actual email
  // For now, log to console
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                    MAGIC LINK                              ║
╠════════════════════════════════════════════════════════════╣
║  Email: ${email.padEnd(49)}║
║  Link:  ${url.slice(0, 49).padEnd(49)}║
${url.length > 49 ? `║        ${url.slice(49).padEnd(49)}║\n` : ""}╚════════════════════════════════════════════════════════════╝
  `);
}
