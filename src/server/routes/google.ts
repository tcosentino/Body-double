/**
 * Google Routes
 *
 * API endpoints for Google OAuth and Gmail/Calendar operations.
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  isGoogleConfigured,
  getGoogleAuthUrl,
  validateOAuthState,
  exchangeCodeForTokens,
  getGoogleUserEmail,
  saveGoogleConnection,
  getGoogleConnectionPublic,
  disconnectGoogle,
  getGoogleApiLogs,
  listEmails,
  getUnreadCount,
  getEmail,
  listCalendarEvents,
  getTodayEvents,
} from "../services/google.js";

const router = Router();

// ============================================
// OAuth Endpoints
// ============================================

/**
 * GET /api/google/connect
 * Start the Google OAuth flow
 * Returns the authorization URL to redirect the user to
 */
router.get("/connect", requireAuth, (req, res) => {
  if (!isGoogleConfigured()) {
    res.status(503).json({
      error: "Google integration not configured",
      message: "Please add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your environment",
    });
    return;
  }

  const authUrl = getGoogleAuthUrl(req.user!.id);
  res.json({ authUrl });
});

/**
 * GET /api/google/callback
 * OAuth callback endpoint - handles the redirect from Google
 */
router.get("/callback", async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    console.error("Google OAuth error:", error);
    res.redirect("/app/settings?google_error=access_denied");
    return;
  }

  if (!code || !state) {
    res.redirect("/app/settings?google_error=invalid_request");
    return;
  }

  // Validate state token
  const userId = validateOAuthState(state as string);
  if (!userId) {
    res.redirect("/app/settings?google_error=invalid_state");
    return;
  }

  // Exchange code for tokens
  const tokens = await exchangeCodeForTokens(code as string);
  if (!tokens) {
    res.redirect("/app/settings?google_error=token_exchange_failed");
    return;
  }

  // Get user's email
  const email = await getGoogleUserEmail(tokens.access_token);
  if (!email) {
    res.redirect("/app/settings?google_error=failed_to_get_email");
    return;
  }

  // Save connection
  saveGoogleConnection(
    userId,
    tokens.access_token,
    tokens.refresh_token,
    tokens.expires_in,
    email,
    JSON.stringify(tokens.scope.split(" "))
  );

  res.redirect("/app/settings?google_connected=true");
});

/**
 * GET /api/google/status
 * Check if the user has a Google connection
 */
router.get("/status", requireAuth, (req, res) => {
  const connection = getGoogleConnectionPublic(req.user!.id);

  res.json({
    connected: !!connection,
    connection,
    configured: isGoogleConfigured(),
  });
});

/**
 * DELETE /api/google/disconnect
 * Disconnect Google from the user's account
 */
router.delete("/disconnect", requireAuth, (req, res) => {
  const disconnected = disconnectGoogle(req.user!.id);

  if (!disconnected) {
    res.status(404).json({ error: "No Google connection found" });
    return;
  }

  res.json({ success: true });
});

// ============================================
// Gmail Endpoints
// ============================================

/**
 * GET /api/google/gmail/messages
 * List recent emails
 */
router.get("/gmail/messages", requireAuth, async (req, res) => {
  const { maxResults, q } = req.query;

  const messages = await listEmails(req.user!.id, {
    maxResults: maxResults ? parseInt(maxResults as string, 10) : undefined,
    query: q as string | undefined,
    triggeredBy: "user_request",
  });

  if (messages === null) {
    res.status(503).json({ error: "Failed to fetch emails. Is Google connected?" });
    return;
  }

  res.json({ messages });
});

/**
 * GET /api/google/gmail/messages/:id
 * Get a specific email
 */
router.get("/gmail/messages/:id", requireAuth, async (req, res) => {
  const message = await getEmail(req.user!.id, req.params.id, "user_request");

  if (!message) {
    res.status(404).json({ error: "Email not found" });
    return;
  }

  res.json(message);
});

/**
 * GET /api/google/gmail/unread
 * Get unread email count
 */
router.get("/gmail/unread", requireAuth, async (req, res) => {
  const count = await getUnreadCount(req.user!.id, "user_request");

  if (count === null) {
    res.status(503).json({ error: "Failed to fetch unread count. Is Google connected?" });
    return;
  }

  res.json({ count });
});

// ============================================
// Calendar Endpoints
// ============================================

/**
 * GET /api/google/calendar/events
 * List upcoming calendar events
 */
router.get("/calendar/events", requireAuth, async (req, res) => {
  const { maxResults, timeMin, timeMax } = req.query;

  const events = await listCalendarEvents(req.user!.id, {
    maxResults: maxResults ? parseInt(maxResults as string, 10) : undefined,
    timeMin: timeMin ? new Date(timeMin as string) : undefined,
    timeMax: timeMax ? new Date(timeMax as string) : undefined,
    triggeredBy: "user_request",
  });

  if (events === null) {
    res.status(503).json({ error: "Failed to fetch calendar events. Is Google connected?" });
    return;
  }

  res.json({ events });
});

/**
 * GET /api/google/calendar/today
 * Get today's calendar events
 */
router.get("/calendar/today", requireAuth, async (req, res) => {
  const events = await getTodayEvents(req.user!.id, "user_request");

  if (events === null) {
    res.status(503).json({ error: "Failed to fetch today's events. Is Google connected?" });
    return;
  }

  res.json({ events });
});

// ============================================
// Logs Endpoints
// ============================================

/**
 * GET /api/google/logs
 * Get Google API call logs
 */
router.get("/logs", requireAuth, (req, res) => {
  const { limit, offset, service } = req.query;

  const result = getGoogleApiLogs(req.user!.id, {
    limit: limit ? parseInt(limit as string, 10) : undefined,
    offset: offset ? parseInt(offset as string, 10) : undefined,
    service: service as string | undefined,
  });

  res.json(result);
});

export default router;
