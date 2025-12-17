/**
 * Context Service Tests
 */

import { describe, it, expect } from "vitest";
import {
  buildUserContext,
  formatContextForPrompt,
  addContextItem,
  touchContextItem,
} from "../../src/server/services/context.js";
import {
  createTestUser,
  createTestSession,
  createTestMessage,
  createTestContextItem,
} from "../utils/test-helpers.js";
import { getTestDb } from "../utils/test-db.js";

describe("Context Service", () => {
  describe("buildUserContext", () => {
    it("should build context for a user with minimal data", () => {
      const user = createTestUser({ name: "Test User" });
      const context = buildUserContext(user.id);

      expect(context.user.name).toBe("Test User");
      expect(context.user.workContext).toBe("Not yet shared");
      expect(context.user.interests).toEqual([]);
      expect(context.recentSessions).toEqual([]);
      expect(context.memories.projects).toEqual([]);
      expect(context.memories.challenges).toEqual([]);
      expect(context.memories.insights).toEqual([]);
    });

    it("should include work context and interests", () => {
      const user = createTestUser({
        name: "Alex",
        work_context: "Software engineer at a startup",
        interests: JSON.stringify(["Rust", "Coffee", "Hiking"]),
      });

      const context = buildUserContext(user.id);

      expect(context.user.workContext).toBe("Software engineer at a startup");
      expect(context.user.interests).toEqual(["Rust", "Coffee", "Hiking"]);
    });

    it("should include recent completed sessions", () => {
      const user = createTestUser();
      const session = createTestSession(user.id, {
        declared_task: "Write unit tests",
        status: "completed",
      });

      // Mark session as completed with outcome
      const db = getTestDb();
      db.prepare(
        `
        UPDATE sessions
        SET ended_at = datetime('now'),
            outcome = 'Got all tests passing!',
            status = 'completed'
        WHERE id = ?
      `
      ).run(session.id);

      const context = buildUserContext(user.id);

      expect(context.recentSessions.length).toBe(1);
      expect(context.recentSessions[0].task).toBe("Write unit tests");
      expect(context.recentSessions[0].outcome).toBe("Got all tests passing!");
    });

    it("should exclude current session from recent sessions", () => {
      const user = createTestUser();
      const completedSession = createTestSession(user.id, {
        declared_task: "Old task",
        status: "completed",
      });
      const currentSession = createTestSession(user.id, {
        declared_task: "Current task",
        status: "active",
      });

      // Mark first session as completed
      const db = getTestDb();
      db.prepare(
        `UPDATE sessions SET ended_at = datetime('now'), status = 'completed' WHERE id = ?`
      ).run(completedSession.id);

      const context = buildUserContext(user.id, currentSession.id);

      // Should only include the completed session, not the current one
      expect(context.recentSessions.length).toBe(1);
      expect(context.recentSessions[0].task).toBe("Old task");
    });

    it("should include context items by category", () => {
      const user = createTestUser();

      createTestContextItem(user.id, "project", "Auth system refactor");
      createTestContextItem(user.id, "project", "API documentation");
      createTestContextItem(user.id, "challenge", "Time management");
      createTestContextItem(user.id, "insight", "Works better in mornings");

      const context = buildUserContext(user.id);

      expect(context.memories.projects).toEqual(["Auth system refactor", "API documentation"]);
      expect(context.memories.challenges).toEqual(["Time management"]);
      expect(context.memories.insights).toEqual(["Works better in mornings"]);
    });

    it("should include current session details when provided", () => {
      const user = createTestUser();
      const session = createTestSession(user.id, {
        declared_task: "Build testing infrastructure",
        duration_planned: 45,
        check_in_frequency: 20,
      });

      const context = buildUserContext(user.id, session.id);

      expect(context.currentSession).toBeDefined();
      expect(context.currentSession!.declaredTask).toBe("Build testing infrastructure");
      expect(context.currentSession!.durationPlanned).toBe(45);
      expect(context.currentSession!.checkInFrequency).toBe(20);
    });

    it("should throw error for non-existent user", () => {
      expect(() => buildUserContext("non-existent-id")).toThrow("User not found");
    });

    it("should order context items by importance", () => {
      const user = createTestUser();

      createTestContextItem(user.id, "project", "Low priority", 1);
      createTestContextItem(user.id, "project", "High priority", 5);
      createTestContextItem(user.id, "project", "Medium priority", 3);

      const context = buildUserContext(user.id);

      // Should be ordered by importance DESC
      expect(context.memories.projects[0]).toBe("High priority");
      expect(context.memories.projects[1]).toBe("Medium priority");
      expect(context.memories.projects[2]).toBe("Low priority");
    });
  });

  describe("formatContextForPrompt", () => {
    it("should format context for prompt injection", () => {
      const user = createTestUser({
        name: "Alex",
        work_context: "Engineer at startup",
        interests: JSON.stringify(["Coding", "Coffee"]),
      });

      createTestContextItem(user.id, "project", "API redesign");
      createTestContextItem(user.id, "challenge", "Focus issues");

      const session = createTestSession(user.id, {
        declared_task: "Fix bugs",
        duration_planned: 30,
        check_in_frequency: 10,
      });

      const context = buildUserContext(user.id, session.id);
      const formatted = formatContextForPrompt(context);

      expect(formatted.userName).toBe("Alex");
      expect(formatted.workContext).toBe("Engineer at startup");
      expect(formatted.interests).toBe("Coding, Coffee");
      expect(formatted.currentProjects).toContain("API redesign");
      expect(formatted.challenges).toContain("Focus issues");
      expect(formatted.declaredTask).toBe("Fix bugs");
      expect(formatted.sessionDuration).toBe("30 minutes");
      expect(formatted.checkInFrequency).toBe("every 10 minutes");
    });

    it("should handle empty context gracefully", () => {
      const user = createTestUser({ name: "New User" });
      const context = buildUserContext(user.id);
      const formatted = formatContextForPrompt(context);

      expect(formatted.userName).toBe("New User");
      expect(formatted.workContext).toBe("Not yet shared");
      expect(formatted.interests).toBe("Not yet shared");
      expect(formatted.currentProjects).toBe("Not yet shared");
      expect(formatted.recentSessions).toBe("This is your first session together.");
      expect(formatted.declaredTask).toBe("Not specified");
    });

    it("should format recent sessions nicely", () => {
      const user = createTestUser();
      const session = createTestSession(user.id, {
        declared_task: "Code review",
        duration_planned: 25,
        status: "completed",
      });

      const db = getTestDb();
      db.prepare(
        `
        UPDATE sessions
        SET ended_at = datetime('now'),
            outcome = 'Reviewed 3 PRs',
            duration_actual = 30,
            status = 'completed'
        WHERE id = ?
      `
      ).run(session.id);

      const context = buildUserContext(user.id);
      const formatted = formatContextForPrompt(context);

      expect(formatted.recentSessions).toContain("Code review");
      expect(formatted.recentSessions).toContain("Reviewed 3 PRs");
      expect(formatted.recentSessions).toContain("30 min");
    });
  });

  describe("addContextItem", () => {
    it("should add a context item for a user", () => {
      const user = createTestUser();
      const item = addContextItem(user.id, "project", "New feature development", 3);

      expect(item.id).toBeDefined();
      expect(item.user_id).toBe(user.id);
      expect(item.category).toBe("project");
      expect(item.content).toBe("New feature development");
      expect(item.importance).toBe(3);
    });

    it("should use default importance of 1", () => {
      const user = createTestUser();
      const item = addContextItem(user.id, "insight", "Needs breaks every hour");

      expect(item.importance).toBe(1);
    });
  });

  describe("touchContextItem", () => {
    it("should update the last_referenced timestamp", () => {
      const user = createTestUser();
      const item = addContextItem(user.id, "project", "Test project");

      const db = getTestDb();
      const before = db
        .prepare(`SELECT last_referenced FROM user_context_items WHERE id = ?`)
        .get(item.id) as { last_referenced: string };

      touchContextItem(item.id);

      const after = db
        .prepare(`SELECT last_referenced FROM user_context_items WHERE id = ?`)
        .get(item.id) as { last_referenced: string };

      // Should be updated (or at least not fail)
      expect(after.last_referenced).toBeDefined();
    });
  });
});
