/**
 * WebSocket Handler
 *
 * Real-time chat using WebSockets with streaming AI responses.
 * Requires authentication via token query parameter.
 */

import { WebSocketServer, WebSocket } from "ws";
import type { Server, IncomingMessage } from "http";
import { getDb } from "./db/index.js";
import { generateStreamingResponse, saveMessage } from "./services/companion.js";
import { validateSession } from "./services/auth.js";
import type { Session, User } from "./db/schema.js";

interface ChatMessage {
  type:
    | "message"
    | "join"
    | "leave"
    | "error"
    | "stream_start"
    | "stream_chunk"
    | "stream_end"
    | "authenticated";
  sessionId?: string;
  content?: string;
  role?: "user" | "assistant";
  error?: string;
  user?: { id: string; name: string; email: string };
}

interface ClientState {
  user: User | null;
  sessionId: string | null;
}

const clients = new Map<WebSocket, ClientState>();

export function setupWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    // Authenticate via token query parameter
    const user = authenticateConnection(req);

    if (!user) {
      ws.send(
        JSON.stringify({ type: "error", error: "Authentication required. Connect with ?token=xxx" })
      );
      ws.close(4001, "Authentication required");
      return;
    }

    clients.set(ws, { user, sessionId: null });

    // Send authentication confirmation
    send(ws, {
      type: "authenticated",
      user: { id: user.id, name: user.name, email: user.email },
      content: "Connected and authenticated",
    });

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

/**
 * Authenticate WebSocket connection via token query parameter
 */
function authenticateConnection(req: IncomingMessage): User | null {
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const token = url.searchParams.get("token");

  if (!token) {
    return null;
  }

  return validateSession(token);
}

async function handleMessage(ws: WebSocket, message: ChatMessage): Promise<void> {
  const state = clients.get(ws);
  if (!state || !state.user) return;

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

async function handleJoin(ws: WebSocket, state: ClientState, message: ChatMessage): Promise<void> {
  const { sessionId } = message;
  const user = state.user!;

  if (!sessionId) {
    sendError(ws, "sessionId is required to join");
    return;
  }

  const db = getDb();

  // Verify session exists and belongs to this user
  const session = db
    .prepare(
      `
    SELECT * FROM sessions WHERE id = ? AND user_id = ?
  `
    )
    .get(sessionId, user.id) as Session | undefined;

  if (!session) {
    sendError(ws, "Session not found");
    return;
  }

  if (session.status !== "active") {
    sendError(ws, "Session is not active");
    return;
  }

  state.sessionId = sessionId;

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
  const user = state.user!;

  if (!state.sessionId) {
    sendError(ws, "Not connected to a session. Send a join message first.");
    return;
  }

  const { content } = message;
  if (!content) {
    sendError(ws, "Message content is required");
    return;
  }

  // Verify session is still active and belongs to user
  const db = getDb();
  const session = db
    .prepare(
      `
    SELECT status FROM sessions WHERE id = ? AND user_id = ?
  `
    )
    .get(state.sessionId, user.id) as { status: string } | undefined;

  if (!session || session.status !== "active") {
    sendError(ws, "Session is no longer active");
    return;
  }

  // Save user message
  saveMessage(state.sessionId, "user", content);

  // Note: We do NOT echo back user messages to the client.
  // The client already displays the message optimistically when sent.
  // Echoing would cause duplicate display.

  // Signal streaming start
  send(ws, { type: "stream_start" });

  // Stream AI response
  let fullResponse = "";
  try {
    const stream = generateStreamingResponse(user.id, state.sessionId, content);

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
