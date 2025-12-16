/**
 * Session Routes
 *
 * Endpoints for managing focus sessions.
 */

import { Router } from "express";
import { getDb } from "../db/index.js";
import { getSessionGreeting, saveMessage } from "../services/companion.js";
import type { Session, Message } from "../db/schema.js";

const router = Router();

/**
 * POST /api/sessions/start
 * Begin a new focus session
 */
router.post("/start", async (req, res) => {
  const { userId, declaredTask, durationPlanned, checkInFrequency } = req.body;

  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  const db = getDb();

  // Check if user exists
  const user = db.prepare(`SELECT id FROM users WHERE id = ?`).get(userId);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Check for existing active session
  const activeSession = db.prepare(`
    SELECT id FROM sessions WHERE user_id = ? AND status = 'active'
  `).get(userId);

  if (activeSession) {
    res.status(409).json({
      error: "User already has an active session",
      sessionId: (activeSession as Session).id,
    });
    return;
  }

  // Create new session
  const sessionId = crypto.randomUUID();
  db.prepare(`
    INSERT INTO sessions (id, user_id, declared_task, duration_planned, check_in_frequency, status)
    VALUES (?, ?, ?, ?, ?, 'active')
  `).run(sessionId, userId, declaredTask || null, durationPlanned || 25, checkInFrequency || 15);

  const session = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionId) as Session;

  // Generate greeting from companion
  try {
    const greeting = await getSessionGreeting(userId, sessionId);
    saveMessage(sessionId, "assistant", greeting);

    res.status(201).json({
      session,
      greeting,
    });
  } catch (error) {
    // Return session even if greeting fails
    console.error("Failed to generate greeting:", error);
    res.status(201).json({
      session,
      greeting: null,
    });
  }
});

/**
 * POST /api/sessions/:id/end
 * End a focus session with optional reflection
 */
router.post("/:id/end", (req, res) => {
  const { outcome } = req.body;
  const db = getDb();

  const session = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(req.params.id) as Session | undefined;

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  if (session.status !== "active") {
    res.status(400).json({ error: "Session is not active" });
    return;
  }

  // Calculate actual duration
  const startTime = new Date(session.started_at).getTime();
  const endTime = Date.now();
  const durationActual = Math.round((endTime - startTime) / 60000); // Convert to minutes

  db.prepare(`
    UPDATE sessions
    SET ended_at = datetime('now'),
        outcome = ?,
        duration_actual = ?,
        status = 'completed'
    WHERE id = ?
  `).run(outcome || null, durationActual, req.params.id);

  const updatedSession = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(req.params.id) as Session;
  res.json(updatedSession);
});

/**
 * POST /api/sessions/:id/abandon
 * Abandon a session (user left without completing)
 */
router.post("/:id/abandon", (req, res) => {
  const db = getDb();

  const session = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(req.params.id) as Session | undefined;

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  if (session.status !== "active") {
    res.status(400).json({ error: "Session is not active" });
    return;
  }

  const startTime = new Date(session.started_at).getTime();
  const endTime = Date.now();
  const durationActual = Math.round((endTime - startTime) / 60000);

  db.prepare(`
    UPDATE sessions
    SET ended_at = datetime('now'),
        duration_actual = ?,
        status = 'abandoned'
    WHERE id = ?
  `).run(durationActual, req.params.id);

  const updatedSession = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(req.params.id) as Session;
  res.json(updatedSession);
});

/**
 * GET /api/sessions/:id
 * Get a session by ID
 */
router.get("/:id", (req, res) => {
  const db = getDb();
  const session = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(req.params.id) as Session | undefined;

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  res.json(session);
});

/**
 * GET /api/sessions/:id/messages
 * Get all messages for a session
 */
router.get("/:id/messages", (req, res) => {
  const db = getDb();

  const session = db.prepare(`SELECT id FROM sessions WHERE id = ?`).get(req.params.id);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const messages = db.prepare(`
    SELECT * FROM messages
    WHERE session_id = ?
    ORDER BY created_at ASC
  `).all(req.params.id) as Message[];

  res.json(messages);
});

/**
 * GET /api/sessions/user/:userId/history
 * Get session history for a user
 */
router.get("/user/:userId/history", (req, res) => {
  const limit = parseInt(req.query.limit as string) || 20;
  const offset = parseInt(req.query.offset as string) || 0;

  const db = getDb();

  const sessions = db.prepare(`
    SELECT * FROM sessions
    WHERE user_id = ?
    ORDER BY started_at DESC
    LIMIT ? OFFSET ?
  `).all(req.params.userId, limit, offset) as Session[];

  const total = db.prepare(`
    SELECT COUNT(*) as count FROM sessions WHERE user_id = ?
  `).get(req.params.userId) as { count: number };

  res.json({
    sessions,
    total: total.count,
    limit,
    offset,
  });
});

/**
 * GET /api/sessions/user/:userId/active
 * Get the active session for a user (if any)
 */
router.get("/user/:userId/active", (req, res) => {
  const db = getDb();

  const session = db.prepare(`
    SELECT * FROM sessions
    WHERE user_id = ? AND status = 'active'
  `).get(req.params.userId) as Session | undefined;

  if (!session) {
    res.status(404).json({ error: "No active session" });
    return;
  }

  res.json(session);
});

export default router;
