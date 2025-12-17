/**
 * WebSocket Chat Tests
 *
 * Tests for the real-time chat WebSocket functionality.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import http from "http";
import express from "express";
import { setupWebSocket } from "../../src/server/websocket.js";
import { setupTestDb, teardownTestDb, resetTestDb } from "../utils/test-db.js";
import { createAuthenticatedUser, createTestSession } from "../utils/test-helpers.js";

describe("WebSocket Chat", () => {
  let server: http.Server;
  let wss: WebSocketServer;
  let serverPort: number;

  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await resetTestDb();

    const app = express();
    server = http.createServer(app);
    wss = setupWebSocket(server);

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        serverPort = typeof addr === "object" && addr ? addr.port : 0;
        resolve();
      });
    });
  });

  afterEach(async () => {
    wss.clients.forEach((client) => client.close());

    await new Promise<void>((resolve) => {
      wss.close(() => {
        server.close(() => resolve());
      });
    });
  });

  function waitForMessage(ws: WebSocket, timeout = 2000): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timeout waiting for message")), timeout);
      ws.once("message", (data) => {
        clearTimeout(timer);
        resolve(JSON.parse(data.toString()));
      });
    });
  }

  function collectMessages(ws: WebSocket, count: number, timeout = 3000): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const messages: any[] = [];
      const timer = setTimeout(() => {
        // Return what we have even on timeout
        resolve(messages);
      }, timeout);

      const handler = (data: Buffer) => {
        messages.push(JSON.parse(data.toString()));
        if (messages.length >= count) {
          clearTimeout(timer);
          ws.off("message", handler);
          resolve(messages);
        }
      };

      ws.on("message", handler);
    });
  }

  describe("Authentication", () => {
    it("should reject connections without a token", async () => {
      const ws = new WebSocket(`ws://localhost:${serverPort}/ws`);

      const message = await waitForMessage(ws);
      expect(message.type).toBe("error");
      expect(message.error).toContain("Authentication required");

      await new Promise<void>((resolve) => {
        ws.on("close", (code) => {
          expect(code).toBe(4001);
          resolve();
        });
      });
    });

    it("should reject connections with an invalid token", async () => {
      const ws = new WebSocket(`ws://localhost:${serverPort}/ws?token=invalid-token`);

      const message = await waitForMessage(ws);
      expect(message.type).toBe("error");
      expect(message.error).toContain("Authentication required");

      await new Promise<void>((resolve) => {
        ws.on("close", () => resolve());
      });
    });

    it("should accept connections with a valid token", async () => {
      const { token } = createAuthenticatedUser();
      const ws = new WebSocket(`ws://localhost:${serverPort}/ws?token=${token}`);

      const message = await waitForMessage(ws);
      expect(message.type).toBe("authenticated");
      expect(message.user).toBeDefined();

      ws.close();
    });
  });

  describe("Session Management", () => {
    it("should allow joining a valid session", async () => {
      const { user, token } = createAuthenticatedUser();
      const session = createTestSession(user.id);

      const ws = new WebSocket(`ws://localhost:${serverPort}/ws?token=${token}`);

      // Wait for authentication
      await waitForMessage(ws);

      // Join session
      ws.send(JSON.stringify({ type: "join", sessionId: session.id }));

      const joinMessage = await waitForMessage(ws);
      expect(joinMessage.type).toBe("join");
      expect(joinMessage.sessionId).toBe(session.id);

      ws.close();
    });

    it("should reject joining a non-existent session", async () => {
      const { token } = createAuthenticatedUser();

      const ws = new WebSocket(`ws://localhost:${serverPort}/ws?token=${token}`);
      await waitForMessage(ws); // auth

      ws.send(JSON.stringify({ type: "join", sessionId: "non-existent-id" }));

      const message = await waitForMessage(ws);
      expect(message.type).toBe("error");
      expect(message.error).toContain("Session not found");

      ws.close();
    });
  });

  describe("Chat Messages", () => {
    it("should NOT echo back user messages (prevents duplicate display)", async () => {
      // Mock the AI response generator to avoid API calls
      vi.mock("../../src/server/services/companion.js", async (importOriginal) => {
        const original = await importOriginal<typeof import("../../src/server/services/companion.js")>();
        return {
          ...original,
          generateStreamingResponse: async function* () {
            yield "Test response";
          },
        };
      });

      const { user, token } = createAuthenticatedUser();
      const session = createTestSession(user.id);

      const ws = new WebSocket(`ws://localhost:${serverPort}/ws?token=${token}`);

      // Wait for auth
      await waitForMessage(ws);

      // Join session
      ws.send(JSON.stringify({ type: "join", sessionId: session.id }));
      await waitForMessage(ws); // join confirmation

      // Send a chat message
      ws.send(JSON.stringify({ type: "message", content: "Hello AI" }));

      // Collect all messages received
      const messages = await collectMessages(ws, 5, 2000);

      // Filter out any user echo messages
      const userEchoMessages = messages.filter(
        (m) => m.type === "message" && m.role === "user" && m.content === "Hello AI"
      );

      // IMPORTANT: Server should NOT echo back user messages
      // The client already displays the message when the user sends it
      // Echoing it back causes duplicate display
      expect(userEchoMessages.length).toBe(0);

      ws.close();
    });

    it("should send stream_start before AI response", async () => {
      const { user, token } = createAuthenticatedUser();
      const session = createTestSession(user.id);

      const ws = new WebSocket(`ws://localhost:${serverPort}/ws?token=${token}`);

      await waitForMessage(ws); // auth
      ws.send(JSON.stringify({ type: "join", sessionId: session.id }));
      await waitForMessage(ws); // join

      ws.send(JSON.stringify({ type: "message", content: "Test" }));

      // Collect messages
      const messages = await collectMessages(ws, 3, 2000);

      // Should have stream_start in the messages
      const streamStart = messages.find((m) => m.type === "stream_start");
      expect(streamStart).toBeDefined();

      ws.close();
    });

    it("should require being in a session to send messages", async () => {
      const { token } = createAuthenticatedUser();

      const ws = new WebSocket(`ws://localhost:${serverPort}/ws?token=${token}`);
      await waitForMessage(ws); // auth

      // Try to send message without joining a session
      ws.send(JSON.stringify({ type: "message", content: "Hello" }));

      const message = await waitForMessage(ws);
      expect(message.type).toBe("error");
      expect(message.error).toContain("Not connected to a session");

      ws.close();
    });
  });

  describe("Connection Handling", () => {
    it("should handle WebSocket path correctly", async () => {
      // Connect to the correct path
      const ws = new WebSocket(`ws://localhost:${serverPort}/ws`);

      // Should get error message (no token), proving path works
      const message = await waitForMessage(ws);
      expect(message.type).toBe("error");

      ws.close();
    });
  });
});
