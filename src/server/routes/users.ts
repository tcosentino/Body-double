/**
 * User Routes
 *
 * Endpoints for user profile and context management.
 * All routes require authentication.
 */

import { Router } from "express";
import { getDb } from "../db/index.js";
import { buildUserContext } from "../services/context.js";
import { requireAuth } from "../middleware/auth.js";
import { parseInterests, parsePreferences } from "../utils/json.js";
import type { User } from "../db/schema.js";

const router = Router();

// All routes require authentication
router.use(requireAuth);

/**
 * GET /api/users/me
 * Get current user profile
 */
router.get("/me", (req, res) => {
  const user = req.user!;

  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    created_at: user.created_at,
    work_context: user.work_context,
    interests: parseInterests(user.interests),
    preferences: parsePreferences(user.preferences),
  });
});

/**
 * PUT /api/users/me
 * Update current user profile
 */
router.put("/me", (req, res) => {
  const { name } = req.body;
  const db = getDb();
  const user = req.user!;

  if (name) {
    db.prepare(`UPDATE users SET name = ? WHERE id = ?`).run(name, user.id);
  }

  const updatedUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(user.id) as User;

  res.json({
    id: updatedUser.id,
    email: updatedUser.email,
    name: updatedUser.name,
    created_at: updatedUser.created_at,
    work_context: updatedUser.work_context,
    interests: parseInterests(updatedUser.interests),
    preferences: parsePreferences(updatedUser.preferences),
  });
});

/**
 * GET /api/users/me/context
 * Get current user's full context for AI companion
 */
router.get("/me/context", (req, res) => {
  const user = req.user!;
  const context = buildUserContext(user.id);
  res.json(context);
});

/**
 * PUT /api/users/me/context
 * Update current user's context (work situation, interests, etc.)
 */
router.put("/me/context", (req, res) => {
  const { workContext, interests } = req.body;
  const db = getDb();
  const user = req.user!;

  const updates: string[] = [];
  const values: unknown[] = [];

  if (workContext !== undefined) {
    updates.push("work_context = ?");
    values.push(workContext);
  }

  if (interests !== undefined) {
    updates.push("interests = ?");
    values.push(JSON.stringify(interests));
  }

  if (updates.length === 0) {
    res.status(400).json({ error: "No updates provided" });
    return;
  }

  values.push(user.id);
  db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(...values);

  const updatedUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(user.id) as User;

  res.json({
    id: updatedUser.id,
    email: updatedUser.email,
    name: updatedUser.name,
    work_context: updatedUser.work_context,
    interests: parseInterests(updatedUser.interests),
    preferences: parsePreferences(updatedUser.preferences),
  });
});

/**
 * PUT /api/users/me/preferences
 * Update current user's preferences
 */
router.put("/me/preferences", (req, res) => {
  const db = getDb();
  const user = req.user!;

  const currentPrefs = parsePreferences(user.preferences);
  const newPrefs = { ...currentPrefs, ...req.body };

  db.prepare(`UPDATE users SET preferences = ? WHERE id = ?`).run(
    JSON.stringify(newPrefs),
    user.id
  );

  res.json(newPrefs);
});

export default router;
