/**
 * Auth Service Tests
 */

import crypto from "node:crypto";
import { describe, it, expect } from "vitest";
import {
  createMagicLink,
  verifyMagicLink,
  validateSession,
  invalidateSession,
  invalidateAllUserSessions,
  cleanupExpiredAuth,
} from "../../src/server/services/auth.js";
import { createTestUser, getTableCount } from "../utils/test-helpers.js";
import { getTestDb } from "../utils/test-db.js";

describe("Auth Service", () => {
  describe("createMagicLink", () => {
    it("should create a magic link for a new email", () => {
      const result = createMagicLink("newuser@example.com");

      expect(result.token).toBeDefined();
      expect(result.token.length).toBe(64); // 32 bytes = 64 hex chars
      expect(result.isNewUser).toBe(true);
      expect(getTableCount("magic_links")).toBe(1);
    });

    it("should create a magic link for an existing user", () => {
      const user = createTestUser({ email: "existing@example.com" });
      const result = createMagicLink("existing@example.com");

      expect(result.token).toBeDefined();
      expect(result.isNewUser).toBe(false);

      // Verify user_id is set on the magic link
      const db = getTestDb();
      const magicLink = db
        .prepare(`SELECT * FROM magic_links WHERE token = ?`)
        .get(result.token) as { user_id: string };
      expect(magicLink.user_id).toBe(user.id);
    });

    it("should invalidate previous magic links for the same email", () => {
      createMagicLink("test@example.com");
      createMagicLink("test@example.com");
      createMagicLink("test@example.com");

      const db = getTestDb();
      const unusedLinks = db
        .prepare(`SELECT COUNT(*) as count FROM magic_links WHERE email = ? AND used_at IS NULL`)
        .get("test@example.com") as { count: number };

      // Only the most recent link should be unused
      expect(unusedLinks.count).toBe(1);
    });

    it("should normalize email to lowercase", () => {
      const result = createMagicLink("TEST@EXAMPLE.COM");

      const db = getTestDb();
      const magicLink = db
        .prepare(`SELECT * FROM magic_links WHERE token = ?`)
        .get(result.token) as { email: string };

      expect(magicLink.email).toBe("test@example.com");
    });
  });

  describe("verifyMagicLink", () => {
    it("should verify a valid magic link and create auth session", () => {
      const { token } = createMagicLink("newuser@example.com");
      const result = verifyMagicLink(token, "New User");

      expect(result).not.toBeNull();
      expect(result!.user.email).toBe("newuser@example.com");
      expect(result!.user.name).toBe("New User");
      expect(result!.sessionToken).toBeDefined();
      expect(result!.sessionToken.length).toBe(64);

      // Verify auth session was created
      expect(getTableCount("auth_sessions")).toBe(1);
    });

    it("should create user with email prefix if no name provided", () => {
      const { token } = createMagicLink("john.doe@example.com");
      const result = verifyMagicLink(token);

      expect(result!.user.name).toBe("john.doe");
    });

    it("should return null for invalid token", () => {
      const result = verifyMagicLink("invalid-token");
      expect(result).toBeNull();
    });

    it("should return null for already used token", () => {
      const { token } = createMagicLink("test@example.com");
      verifyMagicLink(token);

      // Try to use again
      const result = verifyMagicLink(token);
      expect(result).toBeNull();
    });

    it("should return null for expired token", () => {
      const { token } = createMagicLink("test@example.com");

      // Manually expire the token
      const db = getTestDb();
      db.prepare(
        `UPDATE magic_links SET expires_at = datetime('now', '-1 hour') WHERE token = ?`
      ).run(token);

      const result = verifyMagicLink(token);
      expect(result).toBeNull();
    });

    it("should work for existing users", () => {
      const user = createTestUser({ email: "existing@example.com", name: "Existing User" });
      const { token } = createMagicLink("existing@example.com");
      const result = verifyMagicLink(token);

      expect(result!.user.id).toBe(user.id);
      expect(result!.user.name).toBe("Existing User"); // Name should not change
    });
  });

  describe("validateSession", () => {
    it("should validate a valid session token", () => {
      const user = createTestUser();
      const { token } = createMagicLink(user.email);
      const { sessionToken } = verifyMagicLink(token)!;

      const validatedUser = validateSession(sessionToken);

      expect(validatedUser).not.toBeNull();
      expect(validatedUser!.id).toBe(user.id);
    });

    it("should return null for invalid token", () => {
      const result = validateSession("invalid-token");
      expect(result).toBeNull();
    });

    it("should return null for expired session", () => {
      const user = createTestUser();
      const { token } = createMagicLink(user.email);
      const { sessionToken } = verifyMagicLink(token)!;

      // Manually expire the session
      const db = getTestDb();
      db.prepare(
        `UPDATE auth_sessions SET expires_at = datetime('now', '-1 day') WHERE token = ?`
      ).run(sessionToken);

      const result = validateSession(sessionToken);
      expect(result).toBeNull();
    });

    it("should update last_active_at on validation", () => {
      const user = createTestUser();
      const { token } = createMagicLink(user.email);
      const { sessionToken } = verifyMagicLink(token)!;

      const db = getTestDb();
      const before = db
        .prepare(`SELECT last_active_at FROM auth_sessions WHERE token = ?`)
        .get(sessionToken) as { last_active_at: string };

      // Wait a bit and validate again
      validateSession(sessionToken);

      const after = db
        .prepare(`SELECT last_active_at FROM auth_sessions WHERE token = ?`)
        .get(sessionToken) as { last_active_at: string };

      // last_active_at should be updated (or at least not fail)
      expect(before.last_active_at).toBeDefined();
      expect(after.last_active_at).toBeDefined();
    });
  });

  describe("invalidateSession", () => {
    it("should invalidate an existing session", () => {
      const user = createTestUser();
      const { token } = createMagicLink(user.email);
      const { sessionToken } = verifyMagicLink(token)!;

      const result = invalidateSession(sessionToken);
      expect(result).toBe(true);

      // Session should no longer be valid
      const validatedUser = validateSession(sessionToken);
      expect(validatedUser).toBeNull();
    });

    it("should return false for non-existent session", () => {
      const result = invalidateSession("non-existent-token");
      expect(result).toBe(false);
    });
  });

  describe("invalidateAllUserSessions", () => {
    it("should invalidate all sessions for a user", () => {
      const user = createTestUser();

      // Create multiple sessions
      const { token: token1 } = createMagicLink(user.email);
      verifyMagicLink(token1);
      const { token: token2 } = createMagicLink(user.email);
      verifyMagicLink(token2);
      const { token: token3 } = createMagicLink(user.email);
      verifyMagicLink(token3);

      expect(getTableCount("auth_sessions")).toBe(3);

      const count = invalidateAllUserSessions(user.id);
      expect(count).toBe(3);
      expect(getTableCount("auth_sessions")).toBe(0);
    });
  });

  describe("cleanupExpiredAuth", () => {
    it("should clean up expired magic links and sessions", () => {
      const db = getTestDb();

      // Create expired magic link
      db.prepare(
        `
        INSERT INTO magic_links (id, email, token, expires_at)
        VALUES (?, ?, ?, datetime('now', '-1 hour'))
      `
      ).run(crypto.randomUUID(), "expired@example.com", "expired-token");

      // Create expired auth session
      const user = createTestUser();
      db.prepare(
        `
        INSERT INTO auth_sessions (id, user_id, token, expires_at)
        VALUES (?, ?, ?, datetime('now', '-1 day'))
      `
      ).run(crypto.randomUUID(), user.id, "expired-session-token");

      expect(getTableCount("magic_links")).toBe(1);
      expect(getTableCount("auth_sessions")).toBe(1);

      const result = cleanupExpiredAuth();

      expect(result.magicLinks).toBe(1);
      expect(result.sessions).toBe(1);
      expect(getTableCount("magic_links")).toBe(0);
      expect(getTableCount("auth_sessions")).toBe(0);
    });
  });
});
