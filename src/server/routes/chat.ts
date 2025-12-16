/**
 * Chat Routes
 *
 * Endpoints for sending messages during sessions.
 * All routes require authentication.
 * For real-time chat, use WebSocket connections instead.
 */

import { Router } from "express";
import { getDb } from "../db/index.js";
import { generateResponse, saveMessage } from "../services/companion.js";
import { requireAuth } from "../middleware/auth.js";
import type { Session, Message } from "../db/schema.js";

const router = Router();

// All routes require authentication
router.use(requireAuth);

/**
 * POST /api/chat
 * Send a message and get a response (non-streaming)
 */
router.post("/", async (req, res) => {
  const { sessionId, message } = req.body;
  const user = req.user!;

  if (!sessionId || !message) {
    res.status(400).json({ error: "sessionId and message are required" });
    return;
  }

  const db = getDb();

  // Get session and verify it belongs to user and is active
  const session = db.prepare(`
    SELECT * FROM sessions WHERE id = ? AND user_id = ?
  `).get(sessionId, user.id) as Session | undefined;

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
    const response = await generateResponse(user.id, sessionId, message);

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
 * Get chat history for a session (must belong to current user)
 */
router.get("/:sessionId/history", (req, res) => {
  const user = req.user!;
  const db = getDb();

  // Verify session belongs to user
  const session = db.prepare(`
    SELECT id FROM sessions WHERE id = ? AND user_id = ?
  `).get(req.params.sessionId, user.id);

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const messages = db.prepare(`
    SELECT * FROM messages
    WHERE session_id = ?
    ORDER BY created_at ASC
  `).all(req.params.sessionId) as Message[];

  res.json(messages);
});

export default router;
