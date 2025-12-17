/**
 * Notion Routes
 *
 * Handles Notion OAuth flow and workspace configuration.
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  getNotionAuthUrl,
  validateOAuthState,
  exchangeCodeForToken,
  saveNotionConnection,
  getNotionConnectionPublic,
  disconnectNotion,
  updateNotionDatabaseMappings,
  searchDatabases,
  verifyNotionConnection,
  isNotionConfigured,
  getNotionApiLogs,
  getNotionApiLogOperations,
  getNotionApiStats,
} from "../services/notion.js";

const router = Router();

/**
 * GET /api/notion/status
 * Check if user has connected Notion and get connection details
 */
router.get("/status", requireAuth, async (req, res) => {
  const userId = req.user!.id;

  // Check if Notion OAuth is configured
  if (!isNotionConfigured()) {
    res.json({
      configured: false,
      connected: false,
      message: "Notion integration is not configured. Set NOTION_CLIENT_ID and NOTION_CLIENT_SECRET.",
    });
    return;
  }

  const connection = getNotionConnectionPublic(userId);

  if (!connection) {
    res.json({
      configured: true,
      connected: false,
    });
    return;
  }

  // Verify the connection is still valid
  const isValid = await verifyNotionConnection(userId);

  res.json({
    configured: true,
    connected: isValid,
    connection: isValid ? connection : null,
    needsReconnect: !isValid,
  });
});

/**
 * GET /api/notion/connect
 * Redirect to Notion OAuth authorization page
 */
router.get("/connect", requireAuth, (req, res) => {
  const userId = req.user!.id;

  if (!isNotionConfigured()) {
    res.status(503).json({
      error: "Notion integration is not configured",
    });
    return;
  }

  const authUrl = getNotionAuthUrl(userId);
  res.redirect(authUrl);
});

/**
 * GET /api/notion/callback
 * Handle OAuth callback from Notion
 */
router.get("/callback", async (req, res) => {
  const { code, state, error } = req.query;

  // Determine the app URL for redirects
  const appUrl = process.env.APP_URL || "http://localhost:3001";

  // Handle error from Notion
  if (error) {
    console.error("Notion OAuth error:", error);
    res.redirect(`${appUrl}/app/settings?notion_error=access_denied`);
    return;
  }

  // Validate required params
  if (!code || !state || typeof code !== "string" || typeof state !== "string") {
    res.redirect(`${appUrl}/app/settings?notion_error=invalid_request`);
    return;
  }

  // Validate state and get user ID
  const userId = validateOAuthState(state);
  if (!userId) {
    res.redirect(`${appUrl}/app/settings?notion_error=invalid_state`);
    return;
  }

  // Exchange code for token
  const tokenData = await exchangeCodeForToken(code);
  if (!tokenData) {
    res.redirect(`${appUrl}/app/settings?notion_error=token_exchange_failed`);
    return;
  }

  // Save the connection
  saveNotionConnection(userId, tokenData);

  // Redirect to settings with success
  res.redirect(`${appUrl}/app/settings?notion_connected=true`);
});

/**
 * DELETE /api/notion/disconnect
 * Disconnect Notion from user's account
 */
router.delete("/disconnect", requireAuth, (_req, res) => {
  const userId = _req.user!.id;

  const disconnected = disconnectNotion(userId);

  if (disconnected) {
    res.json({ success: true, message: "Notion disconnected" });
  } else {
    res.status(404).json({ error: "No Notion connection found" });
  }
});

/**
 * GET /api/notion/databases
 * List databases in the user's Notion workspace
 */
router.get("/databases", requireAuth, async (req, res) => {
  const userId = req.user!.id;

  const databases = await searchDatabases(userId);

  res.json({
    databases,
  });
});

/**
 * PUT /api/notion/configure
 * Configure which Notion databases to use for tasks, calendar, etc.
 */
router.put("/configure", requireAuth, (req, res) => {
  const userId = req.user!.id;
  const { tasks_database_id, calendar_database_id, notes_database_id, assistant_db_id } = req.body;

  const connection = updateNotionDatabaseMappings(userId, {
    tasks_database_id,
    calendar_database_id,
    notes_database_id,
    assistant_db_id,
  });

  if (!connection) {
    res.status(404).json({ error: "No Notion connection found" });
    return;
  }

  res.json({
    success: true,
    connection,
  });
});

// ============================================
// API Logs Endpoints
// ============================================

/**
 * GET /api/notion/logs
 * Get Notion API call history with pagination and filtering
 */
router.get("/logs", requireAuth, (req, res) => {
  const userId = req.user!.id;
  const {
    limit = "50",
    offset = "0",
    operation,
    start_date,
    end_date,
  } = req.query;

  const result = getNotionApiLogs(userId, {
    limit: parseInt(limit as string, 10),
    offset: parseInt(offset as string, 10),
    operation: operation as string | undefined,
    startDate: start_date as string | undefined,
    endDate: end_date as string | undefined,
  });

  res.json(result);
});

/**
 * GET /api/notion/logs/operations
 * Get list of distinct operations for filtering
 */
router.get("/logs/operations", requireAuth, (req, res) => {
  const userId = req.user!.id;
  const operations = getNotionApiLogOperations(userId);
  res.json({ operations });
});

/**
 * GET /api/notion/logs/stats
 * Get API usage statistics
 */
router.get("/logs/stats", requireAuth, (req, res) => {
  const userId = req.user!.id;
  const stats = getNotionApiStats(userId);
  res.json(stats);
});

export default router;
