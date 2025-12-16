/**
 * WebSocket Handler
 *
 * Real-time chat using WebSockets with streaming AI responses.
 */

import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { getDb } from "./db/index.js";
import { generateStreamingResponse, saveMessage } from "./services/companion.js";
import type { Session } from "./db/schema.js";

interface ChatMessage {
  type: "message" | "join" | "leave" | "error" | "stream_start" | "stream_chunk" | "stream_end";
  sessionId?: string;
  content?: string;
  role?: "user" | "assistant";
  error?: string;
}

interface ClientState {
  sessionId: string | null;
  userId: string | null;
}

const clients = new Map<WebSocket, ClientState>();

export function setupWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws) => {
    clients.set(ws, { sessionId: null, userId: null });

    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString()) as ChatMessage;
        await handleMessage(ws, message);
      } catch (error) {
        sendError(ws, "Invalid message format");
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
      clients.delete(ws);
    });
  });

  return wss;
}

async function handleMessage(ws: WebSocket, message: ChatMessage): Promise<void> {
  const state = clients.get(ws);
  if (!state) return;

  switch (message.type) {
    case "join":
      await handleJoin(ws, state, message);
      break;

    case "message":
      await handleChatMessage(ws, state, message);
      break;

    case "leave":
      handleLeave(ws, state);
      break;

    default:
      sendError(ws, `Unknown message type: ${message.type}`);
  }
}

async function handleJoin(
  ws: WebSocket,
  state: ClientState,
  message: ChatMessage
): Promise<void> {
  const { sessionId } = message;

  if (!sessionId) {
    sendError(ws, "sessionId is required to join");
    return;
  }

  const db = getDb();
  const session = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionId) as Session | undefined;

  if (!session) {
    sendError(ws, "Session not found");
    return;
  }

  if (session.status !== "active") {
    sendError(ws, "Session is not active");
    return;
  }

  state.sessionId = sessionId;
  state.userId = session.user_id;

  send(ws, {
    type: "join",
    sessionId,
    content: "Connected to session",
  });
}

async function handleChatMessage(
  ws: WebSocket,
  state: ClientState,
  message: ChatMessage
): Promise<void> {
  if (!state.sessionId || !state.userId) {
    sendError(ws, "Not connected to a session. Send a join message first.");
    return;
  }

  const { content } = message;
  if (!content) {
    sendError(ws, "Message content is required");
    return;
  }

  // Verify session is still active
  const db = getDb();
  const session = db.prepare(`SELECT status FROM sessions WHERE id = ?`).get(state.sessionId) as { status: string } | undefined;

  if (!session || session.status !== "active") {
    sendError(ws, "Session is no longer active");
    return;
  }

  // Save user message
  saveMessage(state.sessionId, "user", content);

  // Echo back user message
  send(ws, {
    type: "message",
    role: "user",
    content,
  });

  // Signal streaming start
  send(ws, { type: "stream_start" });

  // Stream AI response
  let fullResponse = "";
  try {
    const stream = generateStreamingResponse(state.userId, state.sessionId, content);

    for await (const chunk of stream) {
      fullResponse += chunk;
      send(ws, {
        type: "stream_chunk",
        content: chunk,
      });
    }

    // Save complete response
    saveMessage(state.sessionId, "assistant", fullResponse);

    // Signal streaming end
    send(ws, {
      type: "stream_end",
      content: fullResponse,
    });
  } catch (error) {
    console.error("Streaming error:", error);
    sendError(ws, "Failed to generate response");
  }
}

function handleLeave(ws: WebSocket, state: ClientState): void {
  const sessionId = state.sessionId;
  state.sessionId = null;
  state.userId = null;

  send(ws, {
    type: "leave",
    sessionId: sessionId || undefined,
    content: "Disconnected from session",
  });
}

function send(ws: WebSocket, message: ChatMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function sendError(ws: WebSocket, error: string): void {
  send(ws, { type: "error", error });
}
