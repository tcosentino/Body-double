/**
 * Memory Service
 *
 * Manages user memories/context items that persist across sessions.
 * This is the key to making the companion feel like it truly knows the user.
 */

import { getDb } from "../db/index.js";
import type { UserContextItem, MemoryCategory } from "../db/schema.js";

export interface Memory {
  id: string;
  category: MemoryCategory;
  content: string;
  importance: number;
  lastReferenced: string;
  createdAt: string;
  source?: string;
}

export interface MemoryCreateInput {
  category: MemoryCategory;
  content: string;
  importance?: number;
  source?: string;
}

export interface MemoryUpdateInput {
  content?: string;
  importance?: number;
  category?: MemoryCategory;
}

// Valid memory categories
export const MEMORY_CATEGORIES: MemoryCategory[] = [
  'project',
  'interest',
  'challenge',
  'insight',
  'distraction',
  'goal',
  'preference',
  'win',
  'context',
];

/**
 * Transform DB row to Memory object
 */
function toMemory(row: UserContextItem): Memory {
  return {
    id: row.id,
    category: row.category,
    content: row.content,
    importance: row.importance,
    lastReferenced: row.last_referenced,
    createdAt: row.created_at,
    source: row.source,
  };
}

/**
 * Get all memories for a user
 */
export function getAllMemories(userId: string): Memory[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM user_context_items
    WHERE user_id = ?
    ORDER BY importance DESC, last_referenced DESC
  `).all(userId) as UserContextItem[];

  return rows.map(toMemory);
}

/**
 * Get memories by category
 */
export function getMemoriesByCategory(userId: string, category: MemoryCategory): Memory[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM user_context_items
    WHERE user_id = ? AND category = ?
    ORDER BY importance DESC, last_referenced DESC
  `).all(userId, category) as UserContextItem[];

  return rows.map(toMemory);
}

/**
 * Get a single memory by ID
 */
export function getMemory(userId: string, memoryId: string): Memory | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT * FROM user_context_items
    WHERE id = ? AND user_id = ?
  `).get(memoryId, userId) as UserContextItem | undefined;

  return row ? toMemory(row) : null;
}

/**
 * Create a new memory
 */
export function createMemory(userId: string, input: MemoryCreateInput): Memory {
  const db = getDb();
  const id = crypto.randomUUID();

  db.prepare(`
    INSERT INTO user_context_items (id, user_id, category, content, importance, source)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
    input.category,
    input.content,
    input.importance ?? 1,
    input.source ?? null
  );

  return getMemory(userId, id)!;
}

/**
 * Update an existing memory
 */
export function updateMemory(userId: string, memoryId: string, input: MemoryUpdateInput): Memory | null {
  const db = getDb();

  // Verify ownership
  const existing = getMemory(userId, memoryId);
  if (!existing) {
    return null;
  }

  const updates: string[] = [];
  const values: (string | number)[] = [];

  if (input.content !== undefined) {
    updates.push("content = ?");
    values.push(input.content);
  }
  if (input.importance !== undefined) {
    updates.push("importance = ?");
    values.push(input.importance);
  }
  if (input.category !== undefined) {
    updates.push("category = ?");
    values.push(input.category);
  }

  if (updates.length === 0) {
    return existing;
  }

  values.push(memoryId);

  db.prepare(`
    UPDATE user_context_items
    SET ${updates.join(", ")}
    WHERE id = ?
  `).run(...values);

  return getMemory(userId, memoryId);
}

/**
 * Delete a memory
 */
export function deleteMemory(userId: string, memoryId: string): boolean {
  const db = getDb();

  const result = db.prepare(`
    DELETE FROM user_context_items
    WHERE id = ? AND user_id = ?
  `).run(memoryId, userId);

  return result.changes > 0;
}

/**
 * Touch a memory (update last_referenced timestamp)
 */
export function touchMemory(memoryId: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE user_context_items
    SET last_referenced = datetime('now')
    WHERE id = ?
  `).run(memoryId);
}

/**
 * Search memories by content
 */
export function searchMemories(userId: string, query: string): Memory[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM user_context_items
    WHERE user_id = ? AND content LIKE ?
    ORDER BY importance DESC, last_referenced DESC
  `).all(userId, `%${query}%`) as UserContextItem[];

  return rows.map(toMemory);
}

/**
 * Get memory summary for AI context
 */
export function getMemorySummary(userId: string): {
  projects: string[];
  challenges: string[];
  distractions: string[];
  insights: string[];
  goals: string[];
  wins: string[];
  preferences: string[];
  interests: string[];
  context: string[];
} {
  const memories = getAllMemories(userId);

  const byCategory = (category: MemoryCategory) =>
    memories
      .filter((m) => m.category === category)
      .slice(0, 5) // Limit to top 5 per category
      .map((m) => m.content);

  return {
    projects: byCategory('project'),
    challenges: byCategory('challenge'),
    distractions: byCategory('distraction'),
    insights: byCategory('insight'),
    goals: byCategory('goal'),
    wins: byCategory('win'),
    preferences: byCategory('preference'),
    interests: byCategory('interest'),
    context: byCategory('context'),
  };
}

/**
 * Get suggested memories based on a task description
 * Returns memories that might be relevant to the current task
 */
export function getRelevantMemories(userId: string, taskDescription: string): Memory[] {
  const allMemories = getAllMemories(userId);
  const taskWords = taskDescription.toLowerCase().split(/\s+/);

  // Score memories by relevance
  const scored = allMemories.map((memory) => {
    const contentLower = memory.content.toLowerCase();
    let score = 0;

    // Check for word matches
    for (const word of taskWords) {
      if (word.length > 3 && contentLower.includes(word)) {
        score += 1;
      }
    }

    // Boost by importance
    score += memory.importance * 0.5;

    // Boost recent memories
    const daysSinceReference = (Date.now() - new Date(memory.lastReferenced).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceReference < 7) {
      score += 1;
    }

    // Boost certain categories for task context
    if (['distraction', 'challenge', 'insight'].includes(memory.category)) {
      score += 0.5;
    }

    return { memory, score };
  });

  // Return top relevant memories
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((s) => s.memory);
}

/**
 * Bulk create memories (useful for session extraction)
 */
export function createMemories(userId: string, inputs: MemoryCreateInput[]): Memory[] {
  return inputs.map((input) => createMemory(userId, input));
}

/**
 * Get memory statistics for a user
 */
export function getMemoryStats(userId: string): {
  total: number;
  byCategory: Record<MemoryCategory, number>;
  recentlyAdded: number;
  recentlyReferenced: number;
} {
  const db = getDb();

  const total = (db.prepare(`
    SELECT COUNT(*) as count FROM user_context_items WHERE user_id = ?
  `).get(userId) as { count: number }).count;

  const byCategoryRows = db.prepare(`
    SELECT category, COUNT(*) as count
    FROM user_context_items
    WHERE user_id = ?
    GROUP BY category
  `).all(userId) as { category: MemoryCategory; count: number }[];

  const byCategory = {} as Record<MemoryCategory, number>;
  for (const cat of MEMORY_CATEGORIES) {
    byCategory[cat] = 0;
  }
  for (const row of byCategoryRows) {
    byCategory[row.category] = row.count;
  }

  const recentlyAdded = (db.prepare(`
    SELECT COUNT(*) as count FROM user_context_items
    WHERE user_id = ? AND created_at > datetime('now', '-7 days')
  `).get(userId) as { count: number }).count;

  const recentlyReferenced = (db.prepare(`
    SELECT COUNT(*) as count FROM user_context_items
    WHERE user_id = ? AND last_referenced > datetime('now', '-7 days')
  `).get(userId) as { count: number }).count;

  return {
    total,
    byCategory,
    recentlyAdded,
    recentlyReferenced,
  };
}
