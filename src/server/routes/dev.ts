/**
 * Dev Mode API Routes
 *
 * Provides endpoints for inspecting app state during development.
 * These routes expose internal data and should be disabled in production.
 */

import { Router } from "express";
import { getDb } from "../db/index.js";
import { buildUserContext, formatContextForPrompt } from "../services/context.js";
import { getAllMemories, getMemoryStats, getMemorySummary } from "../services/memory.js";
import {
  getApiCallLogs,
  getApiCallLog,
  getApiCallStats,
  clearApiCallLogs,
} from "../services/apiLogger.js";
import { buildPrompt, systemPromptV1 } from "../../../prompts/system-prompt.js";

const router = Router();

// Check if dev mode is enabled
const isDevMode = process.env.NODE_ENV !== "production";

// Middleware to block in production
router.use((_req, res, next) => {
  if (!isDevMode) {
    return res.status(403).json({
      error: "Dev endpoints are disabled in production",
    });
  }
  next();
});

/**
 * GET /api/dev/status
 * Check dev mode status
 */
router.get("/status", (_req, res) => {
  res.json({
    devMode: true,
    nodeEnv: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/dev/users
 * List all users in the database
 */
router.get("/users", (_req, res) => {
  const db = getDb();
  const users = db
    .prepare(
      `
    SELECT id, email, name, created_at, work_context, interests
    FROM users
    ORDER BY created_at DESC
  `
    )
    .all();

  res.json({ users });
});

/**
 * GET /api/dev/users/:userId/context
 * Get full context for a specific user (what the AI sees)
 */
router.get("/users/:userId/context", (req, res) => {
  const { userId } = req.params;
  const { sessionId } = req.query;

  try {
    const context = buildUserContext(userId, sessionId as string | undefined);
    const formattedContext = formatContextForPrompt(context);

    res.json({
      raw: context,
      formatted: formattedContext,
    });
  } catch (error) {
    res.status(404).json({
      error: error instanceof Error ? error.message : "User not found",
    });
  }
});

/**
 * GET /api/dev/users/:userId/prompt
 * Get the full system prompt that would be sent to the AI
 */
router.get("/users/:userId/prompt", (req, res) => {
  const { userId } = req.params;
  const { sessionId } = req.query;

  try {
    const context = buildUserContext(userId, sessionId as string | undefined);
    const formattedContext = formatContextForPrompt(context);
    const systemPrompt = buildPrompt(systemPromptV1, formattedContext);

    res.json({
      prompt: systemPrompt,
      promptLength: systemPrompt.length,
      estimatedTokens: Math.ceil(systemPrompt.length / 4), // Rough estimate
    });
  } catch (error) {
    res.status(404).json({
      error: error instanceof Error ? error.message : "User not found",
    });
  }
});

/**
 * GET /api/dev/users/:userId/memories
 * Get all memories for a user
 */
router.get("/users/:userId/memories", (req, res) => {
  const { userId } = req.params;

  const memories = getAllMemories(userId);
  const stats = getMemoryStats(userId);
  const summary = getMemorySummary(userId);

  res.json({
    memories,
    stats,
    summary,
  });
});

/**
 * GET /api/dev/sessions
 * List all sessions in the database
 */
router.get("/sessions", (req, res) => {
  const db = getDb();
  const { limit = "50" } = req.query;

  const sessions = db
    .prepare(
      `
    SELECT s.*, u.name as user_name, u.email as user_email,
           (SELECT COUNT(*) FROM messages WHERE session_id = s.id) as message_count
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    ORDER BY s.started_at DESC
    LIMIT ?
  `
    )
    .all(parseInt(limit as string));

  res.json({ sessions });
});

/**
 * GET /api/dev/sessions/:sessionId/messages
 * Get all messages for a session
 */
router.get("/sessions/:sessionId/messages", (req, res) => {
  const { sessionId } = req.params;
  const db = getDb();

  const session = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionId);

  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  const messages = db
    .prepare(
      `
    SELECT * FROM messages
    WHERE session_id = ?
    ORDER BY created_at ASC
  `
    )
    .all(sessionId);

  res.json({ session, messages });
});

/**
 * GET /api/dev/api-calls
 * Get all logged API calls
 */
router.get("/api-calls", (_req, res) => {
  const logs = getApiCallLogs();
  const stats = getApiCallStats();

  res.json({
    stats,
    calls: logs,
  });
});

/**
 * GET /api/dev/api-calls/:callId
 * Get details of a specific API call
 */
router.get("/api-calls/:callId", (req, res) => {
  const { callId } = req.params;
  const log = getApiCallLog(callId);

  if (!log) {
    return res.status(404).json({ error: "API call not found" });
  }

  res.json(log);
});

/**
 * DELETE /api/dev/api-calls
 * Clear all API call logs
 */
router.delete("/api-calls", (_req, res) => {
  clearApiCallLogs();
  res.json({ success: true, message: "API call logs cleared" });
});

/**
 * GET /api/dev/database/tables
 * List all tables and their row counts
 */
router.get("/database/tables", (_req, res) => {
  const db = getDb();

  const tables = db
    .prepare(
      `
    SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'
  `
    )
    .all() as { name: string }[];

  const tableInfo = tables.map((t) => {
    const count = (db.prepare(`SELECT COUNT(*) as count FROM ${t.name}`).get() as { count: number })
      .count;
    return { name: t.name, rowCount: count };
  });

  res.json({ tables: tableInfo });
});

/**
 * GET /api/dev/database/query
 * Execute a read-only SQL query (for debugging)
 */
router.get("/database/query", (req, res) => {
  const { sql } = req.query;

  if (!sql || typeof sql !== "string") {
    return res.status(400).json({ error: "SQL query required" });
  }

  // Only allow SELECT queries
  if (!sql.trim().toLowerCase().startsWith("select")) {
    return res.status(400).json({ error: "Only SELECT queries are allowed" });
  }

  try {
    const db = getDb();
    const results = db.prepare(sql).all();
    res.json({ results, rowCount: results.length });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Query failed",
    });
  }
});

export default router;
