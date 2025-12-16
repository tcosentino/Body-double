/**
 * WebSocket Chat Tests
 *
 * Tests for the real-time chat WebSocket functionality.
 * These tests focus on connection and error handling.
 * Full integration tests with mocked authentication are complex with Vitest module isolation.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import http from "http";
import express from "express";
import { setupWebSocket } from "../../src/server/websocket.js";

describe("WebSocket Chat", () => {
  let server: http.Server;
  let wss: WebSocketServer;
  let serverPort: number;

  beforeEach(async () => {
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
