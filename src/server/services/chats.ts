/**
 * Chats Service
 *
 * Handles main chat and side chats functionality.
 * Side chats allow the assistant to organize conversations by topic.
 */

import crypto from "node:crypto";
import { getDb } from "../db/index.js";
import type {
  SideChat,
  SideChatMessage,
  MainChatMessage,
  SideChatInput,
  SideChatMessageInput,
  MainChatMessageInput,
} from "../db/schema.js";

// ============================================
// Main Chat Operations
// ============================================

/**
 * Get main chat messages for a user
 */
export function getMainChatMessages(
  userId: string,
  options: { limit?: number; offset?: number; before?: string } = {}
): { messages: MainChatMessage[]; total: number } {
  const db = getDb();
  const { limit = 50, offset = 0, before } = options;

  let query = `SELECT * FROM main_chat_messages WHERE user_id = ?`;
  const params: (string | number)[] = [userId];

  if (before) {
    query += ` AND created_at < ?`;
    params.push(before);
  }

  query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const messages = db.prepare(query).all(...params) as MainChatMessage[];

  const total = db
    .prepare(`SELECT COUNT(*) as count FROM main_chat_messages WHERE user_id = ?`)
    .get(userId) as { count: number };

  // Reverse to get chronological order
  return { messages: messages.reverse(), total: total.count };
}

/**
 * Add a message to the main chat
 */
export function addMainChatMessage(userId: string, input: MainChatMessageInput): MainChatMessage {
  const db = getDb();
  const id = crypto.randomUUID();

  db.prepare(
    `
    INSERT INTO main_chat_messages (id, user_id, role, content, spawned_side_chat_id, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `
  ).run(
    id,
    userId,
    input.role,
    input.content,
    input.spawned_side_chat_id || null,
    input.metadata ? JSON.stringify(input.metadata) : null
  );

  return db.prepare(`SELECT * FROM main_chat_messages WHERE id = ?`).get(id) as MainChatMessage;
}

/**
 * Clear main chat history for a user
 */
export function clearMainChat(userId: string): number {
  const db = getDb();
  const result = db.prepare(`DELETE FROM main_chat_messages WHERE user_id = ?`).run(userId);
  return result.changes;
}

// ============================================
// Side Chat Operations
// ============================================

/**
 * Create a new side chat
 */
export function createSideChat(userId: string, input: SideChatInput): SideChat {
  const db = getDb();
  const id = crypto.randomUUID();

  db.prepare(
    `
    INSERT INTO side_chats (id, user_id, title, topic, notion_page_id, context)
    VALUES (?, ?, ?, ?, ?, ?)
  `
  ).run(
    id,
    userId,
    input.title,
    input.topic || null,
    input.notion_page_id || null,
    input.context ? JSON.stringify(input.context) : null
  );

  return db.prepare(`SELECT * FROM side_chats WHERE id = ?`).get(id) as SideChat;
}

/**
 * Get all side chats for a user
 */
export function getSideChats(
  userId: string,
  options: { status?: "active" | "archived"; includeArchived?: boolean } = {}
): SideChat[] {
  const db = getDb();
  const { status, includeArchived = false } = options;

  let query = `SELECT * FROM side_chats WHERE user_id = ?`;
  const params: string[] = [userId];

  if (status) {
    query += ` AND status = ?`;
    params.push(status);
  } else if (!includeArchived) {
    query += ` AND status = 'active'`;
  }

  // Sort: pinned first, then by last message
  query += ` ORDER BY pinned DESC, last_message_at DESC`;

  return db.prepare(query).all(...params) as SideChat[];
}

/**
 * Get a side chat by ID
 */
export function getSideChat(userId: string, chatId: string): SideChat | null {
  const db = getDb();
  return (
    (db
      .prepare(`SELECT * FROM side_chats WHERE id = ? AND user_id = ?`)
      .get(chatId, userId) as SideChat) || null
  );
}

/**
 * Update a side chat
 */
export function updateSideChat(
  userId: string,
  chatId: string,
  updates: Partial<Pick<SideChat, "title" | "topic" | "status" | "pinned" | "context">>
): SideChat | null {
  const db = getDb();

  // Build update query dynamically
  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  if (updates.title !== undefined) {
    fields.push("title = ?");
    values.push(updates.title);
  }
  if (updates.topic !== undefined) {
    fields.push("topic = ?");
    values.push(updates.topic);
  }
  if (updates.status !== undefined) {
    fields.push("status = ?");
    values.push(updates.status);
  }
  if (updates.pinned !== undefined) {
    fields.push("pinned = ?");
    values.push(updates.pinned);
  }
  if (updates.context !== undefined) {
    fields.push("context = ?");
    values.push(
      typeof updates.context === "string" ? updates.context : JSON.stringify(updates.context)
    );
  }

  if (fields.length === 0) return getSideChat(userId, chatId);

  values.push(chatId, userId);

  db.prepare(`UPDATE side_chats SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`).run(
    ...values
  );

  return getSideChat(userId, chatId);
}

/**
 * Archive a side chat
 */
export function archiveSideChat(userId: string, chatId: string): boolean {
  const db = getDb();
  const result = db
    .prepare(`UPDATE side_chats SET status = 'archived' WHERE id = ? AND user_id = ?`)
    .run(chatId, userId);
  return result.changes > 0;
}

/**
 * Delete a side chat and its messages
 */
export function deleteSideChat(userId: string, chatId: string): boolean {
  const db = getDb();

  // First verify ownership
  const chat = getSideChat(userId, chatId);
  if (!chat) return false;

  // Delete messages first (foreign key)
  db.prepare(`DELETE FROM side_chat_messages WHERE side_chat_id = ?`).run(chatId);

  // Update main chat messages that reference this side chat
  db.prepare(
    `UPDATE main_chat_messages SET spawned_side_chat_id = NULL WHERE spawned_side_chat_id = ?`
  ).run(chatId);

  // Delete the chat
  const result = db.prepare(`DELETE FROM side_chats WHERE id = ?`).run(chatId);

  return result.changes > 0;
}

/**
 * Toggle pin status for a side chat
 */
export function toggleSideChatPin(userId: string, chatId: string): SideChat | null {
  const chat = getSideChat(userId, chatId);
  if (!chat) return null;

  return updateSideChat(userId, chatId, { pinned: chat.pinned ? 0 : 1 });
}

// ============================================
// Side Chat Message Operations
// ============================================

/**
 * Get messages for a side chat
 */
export function getSideChatMessages(
  userId: string,
  chatId: string,
  options: { limit?: number; offset?: number } = {}
): { messages: SideChatMessage[]; total: number } | null {
  const db = getDb();
  const { limit = 100, offset = 0 } = options;

  // Verify ownership
  const chat = getSideChat(userId, chatId);
  if (!chat) return null;

  const messages = db
    .prepare(
      `
    SELECT * FROM side_chat_messages
    WHERE side_chat_id = ?
    ORDER BY created_at ASC
    LIMIT ? OFFSET ?
  `
    )
    .all(chatId, limit, offset) as SideChatMessage[];

  const total = db
    .prepare(`SELECT COUNT(*) as count FROM side_chat_messages WHERE side_chat_id = ?`)
    .get(chatId) as { count: number };

  return { messages, total: total.count };
}

/**
 * Add a message to a side chat
 */
export function addSideChatMessage(
  userId: string,
  chatId: string,
  input: SideChatMessageInput
): SideChatMessage | null {
  const db = getDb();

  // Verify ownership
  const chat = getSideChat(userId, chatId);
  if (!chat) return null;

  const id = crypto.randomUUID();

  db.prepare(
    `
    INSERT INTO side_chat_messages (id, side_chat_id, role, content, metadata)
    VALUES (?, ?, ?, ?, ?)
  `
  ).run(
    id,
    chatId,
    input.role,
    input.content,
    input.metadata ? JSON.stringify(input.metadata) : null
  );

  // Update last_message_at on the chat
  db.prepare(`UPDATE side_chats SET last_message_at = datetime('now') WHERE id = ?`).run(chatId);

  return db.prepare(`SELECT * FROM side_chat_messages WHERE id = ?`).get(id) as SideChatMessage;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Create a side chat from the main chat conversation
 * Useful when the assistant wants to branch off a topic
 *
 * @param includeRecentMessages - Number of recent messages to copy from main chat (default 5)
 */
export function spawnSideChatFromMain(
  userId: string,
  title: string,
  topic: string,
  options: {
    initialMessages?: SideChatMessageInput[];
    includeRecentMessages?: number;
  } = {}
): { sideChat: SideChat; mainMessageId: string; copiedMessages: number } {
  const db = getDb();
  const { initialMessages = [], includeRecentMessages = 5 } = options;

  const sideChat = createSideChat(userId, { title, topic });

  // Copy recent messages from main chat to provide context
  let copiedCount = 0;
  if (includeRecentMessages > 0) {
    const recentMainMessages = db
      .prepare(
        `
      SELECT role, content FROM main_chat_messages
      WHERE user_id = ? AND role != 'system'
      ORDER BY created_at DESC
      LIMIT ?
    `
      )
      .all(userId, includeRecentMessages) as { role: string; content: string }[];

    // Add them in chronological order (oldest first)
    for (const msg of recentMainMessages.reverse()) {
      addSideChatMessage(userId, sideChat.id, {
        role: msg.role as "user" | "assistant",
        content: msg.content,
        metadata: { copiedFromMain: true },
      });
      copiedCount++;
    }
  }

  // Add any additional initial messages
  for (const msg of initialMessages) {
    addSideChatMessage(userId, sideChat.id, msg);
  }

  // Add a system message in main chat indicating the spawn
  const mainMessage = addMainChatMessage(userId, {
    role: "system",
    content: `Started side chat: "${title}"`,
    spawned_side_chat_id: sideChat.id,
    metadata: { copiedMessageCount: copiedCount },
  });

  return { sideChat, mainMessageId: mainMessage.id, copiedMessages: copiedCount };
}

/**
 * Get recent activity across all chats
 */
export function getChatActivity(
  userId: string,
  limit: number = 10
): Array<{
  type: "main" | "side";
  chatId?: string;
  chatTitle?: string;
  lastMessage: string;
  timestamp: string;
}> {
  const db = getDb();

  // Get recent main chat messages
  const mainMessages = db
    .prepare(
      `
    SELECT content, created_at FROM main_chat_messages
    WHERE user_id = ? AND role != 'system'
    ORDER BY created_at DESC
    LIMIT ?
  `
    )
    .all(userId, limit) as { content: string; created_at: string }[];

  // Get recent side chat messages with chat info
  const sideMessages = db
    .prepare(
      `
    SELECT
      sc.id as chat_id,
      sc.title as chat_title,
      scm.content,
      scm.created_at
    FROM side_chat_messages scm
    JOIN side_chats sc ON sc.id = scm.side_chat_id
    WHERE sc.user_id = ? AND scm.role != 'system'
    ORDER BY scm.created_at DESC
    LIMIT ?
  `
    )
    .all(userId, limit) as {
    chat_id: string;
    chat_title: string;
    content: string;
    created_at: string;
  }[];

  // Combine and sort
  const activity = [
    ...mainMessages.map((m) => ({
      type: "main" as const,
      lastMessage: m.content,
      timestamp: m.created_at,
    })),
    ...sideMessages.map((m) => ({
      type: "side" as const,
      chatId: m.chat_id,
      chatTitle: m.chat_title,
      lastMessage: m.content,
      timestamp: m.created_at,
    })),
  ];

  // Sort by timestamp descending and limit
  return activity
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}
