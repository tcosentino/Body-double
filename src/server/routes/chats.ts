/**
 * Chats Routes
 *
 * API endpoints for main chat and side chats.
 * All routes require authentication.
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  getMainChatMessages,
  addMainChatMessage,
  clearMainChat,
  getSideChats,
  getSideChat,
  createSideChat,
  updateSideChat,
  archiveSideChat,
  deleteSideChat,
  toggleSideChatPin,
  getSideChatMessages,
  addSideChatMessage,
  spawnSideChatFromMain,
  getChatActivity,
} from "../services/chats.js";

const router = Router();

// All routes require authentication
router.use(requireAuth);

// ============================================
// Main Chat Routes
// ============================================

/**
 * GET /api/chats/main
 * Get main chat message history
 */
router.get("/main", (req, res) => {
  const userId = req.user!.id;
  const { limit, offset, before } = req.query;

  const result = getMainChatMessages(userId, {
    limit: limit ? parseInt(limit as string, 10) : undefined,
    offset: offset ? parseInt(offset as string, 10) : undefined,
    before: before as string | undefined,
  });

  res.json(result);
});

/**
 * POST /api/chats/main/messages
 * Add a message to the main chat
 */
router.post("/main/messages", (req, res) => {
  const userId = req.user!.id;
  const { role, content, metadata } = req.body;

  if (!role || !content) {
    res.status(400).json({ error: "role and content are required" });
    return;
  }

  if (!["user", "assistant", "system"].includes(role)) {
    res.status(400).json({ error: "role must be user, assistant, or system" });
    return;
  }

  const message = addMainChatMessage(userId, { role, content, metadata });
  res.status(201).json(message);
});

/**
 * DELETE /api/chats/main
 * Clear main chat history
 */
router.delete("/main", (req, res) => {
  const userId = req.user!.id;
  const deleted = clearMainChat(userId);
  res.json({ success: true, deleted });
});

// ============================================
// Side Chat Routes
// ============================================

/**
 * GET /api/chats/side
 * List all side chats for the user
 */
router.get("/side", (req, res) => {
  const userId = req.user!.id;
  const { status, includeArchived } = req.query;

  const chats = getSideChats(userId, {
    status: status as "active" | "archived" | undefined,
    includeArchived: includeArchived === "true",
  });

  res.json({ chats });
});

/**
 * POST /api/chats/side
 * Create a new side chat
 */
router.post("/side", (req, res) => {
  const userId = req.user!.id;
  const { title, topic, context, notion_page_id } = req.body;

  if (!title) {
    res.status(400).json({ error: "title is required" });
    return;
  }

  const chat = createSideChat(userId, { title, topic, context, notion_page_id });
  res.status(201).json(chat);
});

/**
 * POST /api/chats/side/spawn
 * Create a side chat spawned from the main conversation
 * Automatically copies recent messages from main chat for context
 */
router.post("/side/spawn", (req, res) => {
  const userId = req.user!.id;
  const { title, topic, initialMessages, includeRecentMessages } = req.body;

  if (!title || !topic) {
    res.status(400).json({ error: "title and topic are required" });
    return;
  }

  const result = spawnSideChatFromMain(userId, title, topic, {
    initialMessages: initialMessages || [],
    includeRecentMessages: includeRecentMessages ?? 5, // Default to 5 messages
  });
  res.status(201).json(result);
});

/**
 * GET /api/chats/side/:id
 * Get a specific side chat
 */
router.get("/side/:id", (req, res) => {
  const userId = req.user!.id;
  const chat = getSideChat(userId, req.params.id);

  if (!chat) {
    res.status(404).json({ error: "Side chat not found" });
    return;
  }

  res.json(chat);
});

/**
 * PATCH /api/chats/side/:id
 * Update a side chat
 */
router.patch("/side/:id", (req, res) => {
  const userId = req.user!.id;
  const { title, topic, status, pinned, context } = req.body;

  const chat = updateSideChat(userId, req.params.id, {
    title,
    topic,
    status,
    pinned,
    context,
  });

  if (!chat) {
    res.status(404).json({ error: "Side chat not found" });
    return;
  }

  res.json(chat);
});

/**
 * POST /api/chats/side/:id/archive
 * Archive a side chat
 */
router.post("/side/:id/archive", (req, res) => {
  const userId = req.user!.id;
  const archived = archiveSideChat(userId, req.params.id);

  if (!archived) {
    res.status(404).json({ error: "Side chat not found" });
    return;
  }

  res.json({ success: true });
});

/**
 * POST /api/chats/side/:id/pin
 * Toggle pin status for a side chat
 */
router.post("/side/:id/pin", (req, res) => {
  const userId = req.user!.id;
  const chat = toggleSideChatPin(userId, req.params.id);

  if (!chat) {
    res.status(404).json({ error: "Side chat not found" });
    return;
  }

  res.json(chat);
});

/**
 * DELETE /api/chats/side/:id
 * Delete a side chat and its messages
 */
router.delete("/side/:id", (req, res) => {
  const userId = req.user!.id;
  const deleted = deleteSideChat(userId, req.params.id);

  if (!deleted) {
    res.status(404).json({ error: "Side chat not found" });
    return;
  }

  res.json({ success: true });
});

// ============================================
// Side Chat Messages Routes
// ============================================

/**
 * GET /api/chats/side/:id/messages
 * Get messages for a side chat
 */
router.get("/side/:id/messages", (req, res) => {
  const userId = req.user!.id;
  const { limit, offset } = req.query;

  const result = getSideChatMessages(userId, req.params.id, {
    limit: limit ? parseInt(limit as string, 10) : undefined,
    offset: offset ? parseInt(offset as string, 10) : undefined,
  });

  if (!result) {
    res.status(404).json({ error: "Side chat not found" });
    return;
  }

  res.json(result);
});

/**
 * POST /api/chats/side/:id/messages
 * Add a message to a side chat
 */
router.post("/side/:id/messages", (req, res) => {
  const userId = req.user!.id;
  const { role, content, metadata } = req.body;

  if (!role || !content) {
    res.status(400).json({ error: "role and content are required" });
    return;
  }

  if (!["user", "assistant", "system"].includes(role)) {
    res.status(400).json({ error: "role must be user, assistant, or system" });
    return;
  }

  const message = addSideChatMessage(userId, req.params.id, { role, content, metadata });

  if (!message) {
    res.status(404).json({ error: "Side chat not found" });
    return;
  }

  res.status(201).json(message);
});

// ============================================
// Activity Route
// ============================================

/**
 * GET /api/chats/activity
 * Get recent chat activity across main and side chats
 */
router.get("/activity", (req, res) => {
  const userId = req.user!.id;
  const { limit } = req.query;

  const activity = getChatActivity(userId, limit ? parseInt(limit as string, 10) : undefined);

  res.json({ activity });
});

export default router;
