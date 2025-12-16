/**
 * Chat Routes
 *
 * Endpoints for sending messages during sessions.
 * For real-time chat, use WebSocket connections instead.
 */

import { Router } from "express";
import { getDb } from "../db/index.js";
import { generateResponse, saveMessage } from "../services/companion.js";
import type { Session, Message } from "../db/schema.js";

const router = Router();

/**
 * POST /api/chat
 * Send a message and get a response (non-streaming)
 */
router.post("/", async (req, res) => {
  const { sessionId, message } = req.body;

  if (!sessionId || !message) {
    res.status(400).json({ error: "sessionId and message are required" });
    return;
  }

  const db = getDb();

  // Get session and verify it's active
  const session = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionId) as Session | undefined;

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  if (session.status !== "active") {
    res.status(400).json({ error: "Session is not active" });
    return;
  }

  // Save user message
  const userMsg = saveMessage(sessionId, "user", message);

  try {
    // Generate response
    const response = await generateResponse(session.user_id, sessionId, message);

    // Save assistant message
    const assistantMsg = saveMessage(sessionId, "assistant", response);

    res.json({
      userMessage: userMsg,
      assistantMessage: assistantMsg,
    });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({
      error: "Failed to generate response",
      userMessage: userMsg,
    });
  }
});

/**
 * GET /api/chat/:sessionId/history
 * Get chat history for a session (alias for /sessions/:id/messages)
 */
router.get("/:sessionId/history", (req, res) => {
  const db = getDb();

  const messages = db.prepare(`
    SELECT * FROM messages
    WHERE session_id = ?
    ORDER BY created_at ASC
  `).all(req.params.sessionId) as Message[];

  res.json(messages);
});

export default router;
