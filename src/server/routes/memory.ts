/**
 * Memory Routes
 *
 * API endpoints for managing user memories (context items).
 * All routes require authentication.
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  getAllMemories,
  getMemoriesByCategory,
  getMemory,
  createMemory,
  updateMemory,
  deleteMemory,
  searchMemories,
  getMemorySummary,
  getMemoryStats,
  MEMORY_CATEGORIES,
} from "../services/memory.js";
import { validateMemoryContent } from "../utils/validation.js";
import type { MemoryCategory } from "../db/schema.js";

const router = Router();

// All routes require authentication
router.use(requireAuth);

/**
 * GET /api/memory
 * Get all memories for the current user
 * Query params:
 *   - category: Filter by category
 *   - search: Search by content
 */
router.get("/", (req, res) => {
  const user = req.user!;
  const { category, search } = req.query;

  try {
    let memories;

    if (search && typeof search === "string") {
      memories = searchMemories(user.id, search);
    } else if (category && typeof category === "string") {
      if (!MEMORY_CATEGORIES.includes(category as MemoryCategory)) {
        res.status(400).json({
          error: `Invalid category. Must be one of: ${MEMORY_CATEGORIES.join(", ")}`,
        });
        return;
      }
      memories = getMemoriesByCategory(user.id, category as MemoryCategory);
    } else {
      memories = getAllMemories(user.id);
    }

    res.json(memories);
  } catch (error) {
    console.error("Error fetching memories:", error);
    res.status(500).json({ error: "Failed to fetch memories" });
  }
});

/**
 * GET /api/memory/summary
 * Get a summary of memories organized by category (for AI context)
 */
router.get("/summary", (req, res) => {
  const user = req.user!;

  try {
    const summary = getMemorySummary(user.id);
    res.json(summary);
  } catch (error) {
    console.error("Error fetching memory summary:", error);
    res.status(500).json({ error: "Failed to fetch memory summary" });
  }
});

/**
 * GET /api/memory/stats
 * Get memory statistics for the current user
 */
router.get("/stats", (req, res) => {
  const user = req.user!;

  try {
    const stats = getMemoryStats(user.id);
    res.json(stats);
  } catch (error) {
    console.error("Error fetching memory stats:", error);
    res.status(500).json({ error: "Failed to fetch memory stats" });
  }
});

/**
 * GET /api/memory/categories
 * Get list of valid memory categories
 */
router.get("/categories", (_req, res) => {
  const categoryDescriptions = {
    project: "Current projects you're working on",
    interest: "Your interests and hobbies",
    challenge: "Common challenges or blockers you face",
    insight: "Insights about what works for you",
    distraction: "Known distractions to watch for",
    goal: "Short or long-term goals",
    preference: "How you like to interact (tone, style)",
    win: "Past wins to reference for encouragement",
    context: "General context about your life/work",
  };

  res.json({
    categories: MEMORY_CATEGORIES,
    descriptions: categoryDescriptions,
  });
});

/**
 * GET /api/memory/:id
 * Get a specific memory
 */
router.get("/:id", (req, res) => {
  const user = req.user!;
  const { id } = req.params;

  try {
    const memory = getMemory(user.id, id);

    if (!memory) {
      res.status(404).json({ error: "Memory not found" });
      return;
    }

    res.json(memory);
  } catch (error) {
    console.error("Error fetching memory:", error);
    res.status(500).json({ error: "Failed to fetch memory" });
  }
});

/**
 * POST /api/memory
 * Create a new memory
 */
router.post("/", (req, res) => {
  const user = req.user!;
  const { category, content, importance, source } = req.body;

  if (!category || !content) {
    res.status(400).json({ error: "category and content are required" });
    return;
  }

  const contentValidation = validateMemoryContent(content);
  if (!contentValidation.valid) {
    res.status(400).json({ error: contentValidation.error });
    return;
  }

  if (!MEMORY_CATEGORIES.includes(category)) {
    res.status(400).json({
      error: `Invalid category. Must be one of: ${MEMORY_CATEGORIES.join(", ")}`,
    });
    return;
  }

  if (importance !== undefined && (importance < 1 || importance > 5)) {
    res.status(400).json({ error: "importance must be between 1 and 5" });
    return;
  }

  try {
    const memory = createMemory(user.id, {
      category,
      content,
      importance,
      source,
    });

    res.status(201).json(memory);
  } catch (error) {
    console.error("Error creating memory:", error);
    res.status(500).json({ error: "Failed to create memory" });
  }
});

/**
 * PUT /api/memory/:id
 * Update a memory
 */
router.put("/:id", (req, res) => {
  const user = req.user!;
  const { id } = req.params;
  const { content, importance, category } = req.body;

  if (category && !MEMORY_CATEGORIES.includes(category)) {
    res.status(400).json({
      error: `Invalid category. Must be one of: ${MEMORY_CATEGORIES.join(", ")}`,
    });
    return;
  }

  if (importance !== undefined && (importance < 1 || importance > 5)) {
    res.status(400).json({ error: "importance must be between 1 and 5" });
    return;
  }

  try {
    const memory = updateMemory(user.id, id, { content, importance, category });

    if (!memory) {
      res.status(404).json({ error: "Memory not found" });
      return;
    }

    res.json(memory);
  } catch (error) {
    console.error("Error updating memory:", error);
    res.status(500).json({ error: "Failed to update memory" });
  }
});

/**
 * DELETE /api/memory/:id
 * Delete a memory
 */
router.delete("/:id", (req, res) => {
  const user = req.user!;
  const { id } = req.params;

  try {
    const deleted = deleteMemory(user.id, id);

    if (!deleted) {
      res.status(404).json({ error: "Memory not found" });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting memory:", error);
    res.status(500).json({ error: "Failed to delete memory" });
  }
});

/**
 * POST /api/memory/bulk
 * Create multiple memories at once
 */
router.post("/bulk", (req, res) => {
  const user = req.user!;
  const { memories } = req.body;

  if (!Array.isArray(memories) || memories.length === 0) {
    res.status(400).json({ error: "memories array is required" });
    return;
  }

  // Validate all memories
  for (const mem of memories) {
    if (!mem.category || !mem.content) {
      res.status(400).json({ error: "Each memory requires category and content" });
      return;
    }
    if (!MEMORY_CATEGORIES.includes(mem.category)) {
      res.status(400).json({
        error: `Invalid category '${mem.category}'. Must be one of: ${MEMORY_CATEGORIES.join(", ")}`,
      });
      return;
    }
  }

  try {
    const created = memories.map((mem) =>
      createMemory(user.id, {
        category: mem.category,
        content: mem.content,
        importance: mem.importance,
        source: mem.source,
      })
    );

    res.status(201).json(created);
  } catch (error) {
    console.error("Error creating memories:", error);
    res.status(500).json({ error: "Failed to create memories" });
  }
});

export default router;
