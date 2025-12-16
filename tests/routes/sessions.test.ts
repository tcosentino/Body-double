/**
 * Session Routes Integration Tests
 */

import { describe, it, expect } from "vitest";
import request from "supertest";
import { createTestApp } from "../utils/test-app.js";
import {
  createAuthenticatedUser,
  createTestSession,
  createTestMessage,
  getTableCount,
} from "../utils/test-helpers.js";
import { getTestDb } from "../utils/test-db.js";

const app = createTestApp();

describe("Session Routes", () => {
  describe("POST /api/sessions/start", () => {
    it("should start a new focus session", async () => {
      const { token } = createAuthenticatedUser();

      const response = await request(app)
        .post("/api/sessions/start")
        .set("Authorization", `Bearer ${token}`)
        .send({
          declaredTask: "Write documentation",
          durationPlanned: 45,
          checkInFrequency: 15,
        });

      expect(response.status).toBe(201);
      expect(response.body.session).toBeDefined();
      expect(response.body.session.declared_task).toBe("Write documentation");
      expect(response.body.session.duration_planned).toBe(45);
      expect(response.body.session.check_in_frequency).toBe(15);
      expect(response.body.session.status).toBe("active");
    });

    it("should use default values for duration and check-in", async () => {
      const { token } = createAuthenticatedUser();

      const response = await request(app)
        .post("/api/sessions/start")
        .set("Authorization", `Bearer ${token}`)
        .send({ declaredTask: "Quick task" });

      expect(response.status).toBe(201);
      expect(response.body.session.duration_planned).toBe(25); // Default
      expect(response.body.session.check_in_frequency).toBe(15); // Default
    });

    it("should return 409 if user already has an active session", async () => {
      const { user, token } = createAuthenticatedUser();
      const existingSession = createTestSession(user.id, { status: "active" });

      const response = await request(app)
        .post("/api/sessions/start")
        .set("Authorization", `Bearer ${token}`)
        .send({ declaredTask: "New task" });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe("You already have an active session");
      expect(response.body.sessionId).toBe(existingSession.id);
    });

    it("should return 401 when not authenticated", async () => {
      const response = await request(app)
        .post("/api/sessions/start")
        .send({ declaredTask: "Test" });

      expect(response.status).toBe(401);
    });
  });

  describe("GET /api/sessions/active", () => {
    it("should return the active session", async () => {
      const { user, token } = createAuthenticatedUser();
      const session = createTestSession(user.id, {
        declared_task: "Active task",
        status: "active",
      });

      const response = await request(app)
        .get("/api/sessions/active")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(session.id);
      expect(response.body.declared_task).toBe("Active task");
    });

    it("should return 404 if no active session", async () => {
      const { token } = createAuthenticatedUser();

      const response = await request(app)
        .get("/api/sessions/active")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe("No active session");
    });
  });

  describe("GET /api/sessions/history", () => {
    it("should return session history", async () => {
      const { user, token } = createAuthenticatedUser();

      // Create multiple sessions
      createTestSession(user.id, { declared_task: "Task 1", status: "completed" });
      createTestSession(user.id, { declared_task: "Task 2", status: "completed" });
      createTestSession(user.id, { declared_task: "Task 3", status: "active" });

      const response = await request(app)
        .get("/api/sessions/history")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.sessions.length).toBe(3);
      expect(response.body.total).toBe(3);
    });

    it("should support pagination", async () => {
      const { user, token } = createAuthenticatedUser();

      // Create 5 sessions
      for (let i = 0; i < 5; i++) {
        createTestSession(user.id, { declared_task: `Task ${i}`, status: "completed" });
      }

      const response = await request(app)
        .get("/api/sessions/history?limit=2&offset=2")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.sessions.length).toBe(2);
      expect(response.body.total).toBe(5);
      expect(response.body.limit).toBe(2);
      expect(response.body.offset).toBe(2);
    });
  });

  describe("GET /api/sessions/:id", () => {
    it("should return a session by ID", async () => {
      const { user, token } = createAuthenticatedUser();
      const session = createTestSession(user.id, { declared_task: "Get by ID" });

      const response = await request(app)
        .get(`/api/sessions/${session.id}`)
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(session.id);
      expect(response.body.declared_task).toBe("Get by ID");
    });

    it("should return 404 for non-existent session", async () => {
      const { token } = createAuthenticatedUser();

      const response = await request(app)
        .get("/api/sessions/non-existent-id")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(404);
    });

    it("should not return sessions belonging to other users", async () => {
      const { user: otherUser } = createAuthenticatedUser();
      const { token } = createAuthenticatedUser();

      const otherSession = createTestSession(otherUser.id, { declared_task: "Other user task" });

      const response = await request(app)
        .get(`/api/sessions/${otherSession.id}`)
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(404);
    });
  });

  describe("GET /api/sessions/:id/messages", () => {
    it("should return messages for a session", async () => {
      const { user, token } = createAuthenticatedUser();
      const session = createTestSession(user.id);

      createTestMessage(session.id, "user", "Hello");
      createTestMessage(session.id, "assistant", "Hi there!");
      createTestMessage(session.id, "user", "How are you?");

      const response = await request(app)
        .get(`/api/sessions/${session.id}/messages`)
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.length).toBe(3);
      expect(response.body[0].content).toBe("Hello");
      expect(response.body[1].content).toBe("Hi there!");
    });
  });

  describe("POST /api/sessions/:id/end", () => {
    it("should end a session with outcome", async () => {
      const { user, token } = createAuthenticatedUser();
      const session = createTestSession(user.id, { status: "active" });

      const response = await request(app)
        .post(`/api/sessions/${session.id}/end`)
        .set("Authorization", `Bearer ${token}`)
        .send({ outcome: "Got a lot done!" });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("completed");
      expect(response.body.outcome).toBe("Got a lot done!");
      expect(response.body.ended_at).toBeDefined();
      expect(response.body.duration_actual).toBeDefined();
    });

    it("should return 400 for already ended session", async () => {
      const { user, token } = createAuthenticatedUser();
      const session = createTestSession(user.id, { status: "completed" });

      const db = getTestDb();
      db.prepare(`UPDATE sessions SET status = 'completed' WHERE id = ?`).run(session.id);

      const response = await request(app)
        .post(`/api/sessions/${session.id}/end`)
        .set("Authorization", `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Session is not active");
    });
  });

  describe("POST /api/sessions/:id/abandon", () => {
    it("should abandon a session", async () => {
      const { user, token } = createAuthenticatedUser();
      const session = createTestSession(user.id, { status: "active" });

      const response = await request(app)
        .post(`/api/sessions/${session.id}/abandon`)
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("abandoned");
      expect(response.body.ended_at).toBeDefined();
    });
  });
});
