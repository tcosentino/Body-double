/**
 * Briefing Routes
 *
 * API endpoints for briefings and alerts.
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  generateMorningBriefing,
  getTodayBriefing,
  getRecentBriefings,
  markBriefingViewed,
  getAlerts,
  getUnreadAlertCount,
  markAlertRead,
  markAllAlertsRead,
  dismissAlert,
  gatherBriefingData,
} from "../services/briefing.js";
import {
  triggerUserCheck,
  initializeBackgroundChecks,
} from "../services/scheduler.js";

const router = Router();

// ============================================
// Briefing Endpoints
// ============================================

/**
 * GET /api/briefing/today
 * Get today's morning briefing (generates if needed)
 */
router.get("/today", requireAuth, async (req, res) => {
  let briefing = getTodayBriefing(req.user!.id, "morning");

  if (!briefing) {
    // Generate a new briefing
    briefing = await generateMorningBriefing(req.user!.id);
  }

  // Mark as viewed
  markBriefingViewed(req.user!.id, briefing.id);

  res.json({
    briefing: {
      ...briefing,
      calendar_events: briefing.calendar_events ? JSON.parse(briefing.calendar_events) : [],
      emails: briefing.emails ? JSON.parse(briefing.emails) : [],
      tasks: briefing.tasks ? JSON.parse(briefing.tasks) : [],
    },
  });
});

/**
 * POST /api/briefing/generate
 * Force generate a new briefing
 */
router.post("/generate", requireAuth, async (req, res) => {
  const briefing = await generateMorningBriefing(req.user!.id);

  res.json({
    briefing: {
      ...briefing,
      calendar_events: briefing.calendar_events ? JSON.parse(briefing.calendar_events) : [],
      emails: briefing.emails ? JSON.parse(briefing.emails) : [],
      tasks: briefing.tasks ? JSON.parse(briefing.tasks) : [],
    },
  });
});

/**
 * GET /api/briefing/data
 * Get raw briefing data without generating a briefing
 */
router.get("/data", requireAuth, async (req, res) => {
  const data = await gatherBriefingData(req.user!.id);
  res.json(data);
});

/**
 * GET /api/briefing/history
 * Get recent briefings
 */
router.get("/history", requireAuth, (req, res) => {
  const { limit } = req.query;
  const briefings = getRecentBriefings(
    req.user!.id,
    limit ? parseInt(limit as string, 10) : 7
  );

  res.json({
    briefings: briefings.map((b) => ({
      ...b,
      calendar_events: b.calendar_events ? JSON.parse(b.calendar_events) : [],
      emails: b.emails ? JSON.parse(b.emails) : [],
      tasks: b.tasks ? JSON.parse(b.tasks) : [],
    })),
  });
});

// ============================================
// Alert Endpoints
// ============================================

/**
 * GET /api/briefing/alerts
 * Get alerts for the current user
 */
router.get("/alerts", requireAuth, (req, res) => {
  const { status, type, limit, offset } = req.query;

  const result = getAlerts(req.user!.id, {
    status: status as string | undefined,
    type: type as string | undefined,
    limit: limit ? parseInt(limit as string, 10) : undefined,
    offset: offset ? parseInt(offset as string, 10) : undefined,
  });

  res.json(result);
});

/**
 * GET /api/briefing/alerts/unread
 * Get unread alert count
 */
router.get("/alerts/unread", requireAuth, (req, res) => {
  const count = getUnreadAlertCount(req.user!.id);
  res.json({ count });
});

/**
 * POST /api/briefing/alerts/:id/read
 * Mark an alert as read
 */
router.post("/alerts/:id/read", requireAuth, (req, res) => {
  const success = markAlertRead(req.user!.id, req.params.id);

  if (!success) {
    res.status(404).json({ error: "Alert not found" });
    return;
  }

  res.json({ success: true });
});

/**
 * POST /api/briefing/alerts/read-all
 * Mark all alerts as read
 */
router.post("/alerts/read-all", requireAuth, (req, res) => {
  const count = markAllAlertsRead(req.user!.id);
  res.json({ success: true, count });
});

/**
 * POST /api/briefing/alerts/:id/dismiss
 * Dismiss an alert
 */
router.post("/alerts/:id/dismiss", requireAuth, (req, res) => {
  const success = dismissAlert(req.user!.id, req.params.id);

  if (!success) {
    res.status(404).json({ error: "Alert not found" });
    return;
  }

  res.json({ success: true });
});

// ============================================
// Background Check Endpoints
// ============================================

/**
 * POST /api/briefing/check
 * Manually trigger background checks for current user
 */
router.post("/check", requireAuth, async (req, res) => {
  const { type = "all" } = req.body;

  // Initialize background checks if not already done
  initializeBackgroundChecks(req.user!.id);

  const result = await triggerUserCheck(
    req.user!.id,
    type as "email" | "calendar" | "briefing" | "all"
  );

  res.json(result);
});

export default router;
