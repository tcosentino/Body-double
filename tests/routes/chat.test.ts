/**
 * Chat Routes Integration Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createTestApp } from "../utils/test-app.js";
import {
  createAuthenticatedUser,
  createTestSession,
  createTestMessage,
} from "../utils/test-helpers.js";

// Mock the companion service to avoid API calls
vi.mock("../../src/server/services/companion.js", () => ({
  generateResponse: vi.fn().mockResolvedValue("I'm here to help you focus!"),
  saveMessage: vi.fn((sessionId, role, content) => ({
    id: `msg-${Date.now()}`,
    session_id: sessionId,
    role,
    content,
    created_at: new Date().toISOString(),
  })),
}));

import { generateResponse } from "../../src/server/services/companion.js";

const app = createTestApp();

describe("Chat Routes", () => {
  beforeEach(() => {
    vi.mocked(generateResponse).mockClear();
  });

  describe("POST /api/chat", () => {
    it("should send a message and receive a response", async () => {
      const { user, token } = createAuthenticatedUser();
      const session = createTestSession(user.id, { status: "active" });

      const response = await request(app)
        .post("/api/chat")
        .set("Authorization", `Bearer ${token}`)
        .send({
          sessionId: session.id,
          message: "I need to focus on my work",
        });

      expect(response.status).toBe(200);
      expect(response.body.userMessage).toBeDefined();
      expect(response.body.userMessage.content).toBe("I need to focus on my work");
      expect(response.body.userMessage.role).toBe("user");
      expect(response.body.assistantMessage).toBeDefined();
      expect(response.body.assistantMessage.content).toBe("I'm here to help you focus!");
      expect(response.body.assistantMessage.role).toBe("assistant");
    });

    it("should call generateResponse with correct parameters", async () => {
      const { user, token } = createAuthenticatedUser();
      const session = createTestSession(user.id, { status: "active" });

      await request(app)
        .post("/api/chat")
        .set("Authorization", `Bearer ${token}`)
        .send({
          sessionId: session.id,
          message: "Hello!",
        });

      expect(generateResponse).toHaveBeenCalledWith(user.id, session.id, "Hello!");
    });

    it("should return 400 when sessionId is missing", async () => {
      const { token } = createAuthenticatedUser();

      const response = await request(app)
        .post("/api/chat")
        .set("Authorization", `Bearer ${token}`)
        .send({ message: "Hello" });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("sessionId and message are required");
    });

    it("should return 400 when message is missing", async () => {
      const { user, token } = createAuthenticatedUser();
      const session = createTestSession(user.id);

      const response = await request(app)
        .post("/api/chat")
        .set("Authorization", `Bearer ${token}`)
        .send({ sessionId: session.id });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("sessionId and message are required");
    });

    it("should return 404 for non-existent session", async () => {
      const { token } = createAuthenticatedUser();

      const response = await request(app)
        .post("/api/chat")
        .set("Authorization", `Bearer ${token}`)
        .send({
          sessionId: "non-existent",
          message: "Hello",
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Session not found");
    });

    it("should return 404 for another user's session", async () => {
      const { user: otherUser } = createAuthenticatedUser();
      const { token } = createAuthenticatedUser();
      const session = createTestSession(otherUser.id, { status: "active" });

      const response = await request(app)
        .post("/api/chat")
        .set("Authorization", `Bearer ${token}`)
        .send({
          sessionId: session.id,
          message: "Hello",
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Session not found");
    });

    it("should return 400 for inactive session", async () => {
      const { user, token } = createAuthenticatedUser();
      const session = createTestSession(user.id, { status: "completed" });

      const response = await request(app)
        .post("/api/chat")
        .set("Authorization", `Bearer ${token}`)
        .send({
          sessionId: session.id,
          message: "Hello",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Session is not active");
    });

    it("should return 401 when not authenticated", async () => {
      const response = await request(app)
        .post("/api/chat")
        .send({
          sessionId: "some-id",
          message: "Hello",
        });

      expect(response.status).toBe(401);
    });
  });

  describe("GET /api/chat/:sessionId/history", () => {
    it("should return chat history for a session", async () => {
      const { user, token } = createAuthenticatedUser();
      const session = createTestSession(user.id);

      createTestMessage(session.id, "user", "Hello!");
      createTestMessage(session.id, "assistant", "Hi there!");
      createTestMessage(session.id, "user", "How's it going?");
      createTestMessage(session.id, "assistant", "Great! Ready to help you focus.");

      const response = await request(app)
        .get(`/api/chat/${session.id}/history`)
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.length).toBe(4);
      expect(response.body[0].content).toBe("Hello!");
      expect(response.body[0].role).toBe("user");
      expect(response.body[1].content).toBe("Hi there!");
      expect(response.body[1].role).toBe("assistant");
    });

    it("should return empty array for session with no messages", async () => {
      const { user, token } = createAuthenticatedUser();
      const session = createTestSession(user.id);

      const response = await request(app)
        .get(`/api/chat/${session.id}/history`)
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it("should return 404 for non-existent session", async () => {
      const { token } = createAuthenticatedUser();

      const response = await request(app)
        .get("/api/chat/non-existent/history")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Session not found");
    });

    it("should return 404 for another user's session", async () => {
      const { user: otherUser } = createAuthenticatedUser();
      const { token } = createAuthenticatedUser();
      const session = createTestSession(otherUser.id);

      createTestMessage(session.id, "user", "Secret message");

      const response = await request(app)
        .get(`/api/chat/${session.id}/history`)
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Session not found");
    });

    it("should return 401 when not authenticated", async () => {
      const response = await request(app).get("/api/chat/some-id/history");

      expect(response.status).toBe(401);
    });
  });
});
