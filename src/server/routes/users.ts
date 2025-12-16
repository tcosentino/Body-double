/**
 * User Routes
 *
 * Endpoints for user management and context.
 */

import { Router } from "express";
import { getDb } from "../db/index.js";
import { buildUserContext } from "../services/context.js";
import type { User } from "../db/schema.js";

const router = Router();

/**
 * POST /api/users
 * Create a new user (simple registration)
 */
router.post("/", (req, res) => {
  const { email, name } = req.body;

  if (!email || !name) {
    res.status(400).json({ error: "Email and name are required" });
    return;
  }

  const db = getDb();
  const id = crypto.randomUUID();

  try {
    db.prepare(`
      INSERT INTO users (id, email, name)
      VALUES (?, ?, ?)
    `).run(id, email, name);

    const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) as User;
    res.status(201).json(user);
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint")) {
      res.status(409).json({ error: "Email already exists" });
    } else {
      throw error;
    }
  }
});

/**
 * GET /api/users/:id
 * Get a user by ID
 */
router.get("/:id", (req, res) => {
  const db = getDb();
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.params.id) as User | undefined;

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Parse JSON fields
  res.json({
    ...user,
    interests: user.interests ? JSON.parse(user.interests) : [],
    preferences: JSON.parse(user.preferences),
  });
});

/**
 * GET /api/users/email/:email
 * Get a user by email (for simple auth)
 */
router.get("/email/:email", (req, res) => {
  const db = getDb();
  const user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(req.params.email) as User | undefined;

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({
    ...user,
    interests: user.interests ? JSON.parse(user.interests) : [],
    preferences: JSON.parse(user.preferences),
  });
});

/**
 * PUT /api/users/:id/context
 * Update user context (work situation, interests, etc.)
 */
router.put("/:id/context", (req, res) => {
  const { workContext, interests } = req.body;
  const db = getDb();

  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.params.id);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

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

  values.push(req.params.id);
  db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(...values);

  const updatedUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.params.id) as User;
  res.json({
    ...updatedUser,
    interests: updatedUser.interests ? JSON.parse(updatedUser.interests) : [],
    preferences: JSON.parse(updatedUser.preferences),
  });
});

/**
 * GET /api/users/:id/context
 * Get full user context for AI companion
 */
router.get("/:id/context", (req, res) => {
  try {
    const context = buildUserContext(req.params.id);
    res.json(context);
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes("User not found")) {
      res.status(404).json({ error: "User not found" });
    } else {
      throw error;
    }
  }
});

/**
 * PUT /api/users/:id/preferences
 * Update user preferences
 */
router.put("/:id/preferences", (req, res) => {
  const db = getDb();

  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.params.id) as User | undefined;
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const currentPrefs = JSON.parse(user.preferences);
  const newPrefs = { ...currentPrefs, ...req.body };

  db.prepare(`UPDATE users SET preferences = ? WHERE id = ?`).run(
    JSON.stringify(newPrefs),
    req.params.id
  );

  res.json(newPrefs);
});

export default router;
