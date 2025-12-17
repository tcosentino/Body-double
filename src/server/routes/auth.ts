/**
 * Auth Routes
 *
 * Handles magic link authentication flow.
 */

import { Router } from "express";
import {
  createMagicLink,
  verifyMagicLink,
  invalidateSession,
  sendMagicLink,
  getMagicLinkUrl,
} from "../services/auth.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

/**
 * POST /api/auth/request
 * Request a magic link to be sent to email
 */
router.post("/request", (req, res) => {
  const { email } = req.body;

  if (!email) {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    res.status(400).json({ error: "Invalid email format" });
    return;
  }

  const { token, isNewUser } = createMagicLink(email);

  // Send the magic link (logs to console in dev)
  sendMagicLink(email, token);

  // In development, also return the URL directly for easier testing
  const isDev = process.env.NODE_ENV !== "production";

  res.json({
    success: true,
    message: "Magic link sent to your email",
    isNewUser,
    // Only include in development
    ...(isDev && {
      devUrl: getMagicLinkUrl(token),
      devToken: token,
    }),
  });
});

/**
 * POST /api/auth/verify
 * Verify a magic link token and get an auth session
 */
router.post("/verify", (req, res) => {
  const { token, name } = req.body;

  if (!token) {
    res.status(400).json({ error: "Token is required" });
    return;
  }

  const result = verifyMagicLink(token, name);

  if (!result) {
    res.status(401).json({ error: "Invalid or expired magic link" });
    return;
  }

  const { user, sessionToken } = result;

  // Set cookie for browser clients
  res.setHeader(
    "Set-Cookie",
    `auth_token=${sessionToken}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${30 * 24 * 60 * 60}`
  );

  res.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      created_at: user.created_at,
    },
    token: sessionToken,
  });
});

/**
 * GET /api/auth/me
 * Get current authenticated user
 */
router.get("/me", requireAuth, (req, res) => {
  const user = req.user!;

  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    created_at: user.created_at,
    work_context: user.work_context,
    interests: user.interests ? JSON.parse(user.interests) : [],
    preferences: JSON.parse(user.preferences),
  });
});

/**
 * POST /api/auth/logout
 * Logout current session
 */
router.post("/logout", requireAuth, (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  // Also check cookie
  const cookieHeader = req.headers.cookie;
  let cookieToken: string | null = null;
  if (cookieHeader) {
    const match = cookieHeader.match(/auth_token=([^;]+)/);
    cookieToken = match ? match[1] : null;
  }

  const tokenToInvalidate = token || cookieToken;

  if (tokenToInvalidate) {
    invalidateSession(tokenToInvalidate);
  }

  // Clear cookie
  res.setHeader(
    "Set-Cookie",
    "auth_token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0"
  );

  res.json({ success: true, message: "Logged out" });
});

export default router;
