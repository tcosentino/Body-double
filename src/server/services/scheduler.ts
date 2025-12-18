/**
 * Background Scheduler Service
 *
 * Runs periodic background tasks for the personal assistant:
 * - Checks for new emails and creates alerts
 * - Monitors upcoming calendar events for reminders
 * - Generates morning briefings
 *
 * Uses a simple interval-based approach for local development.
 * Can be replaced with a more robust job queue for production.
 */

import { getDb } from "../db/index.js";
import {
  checkNewEmails,
  checkUpcomingEvents,
  generateMorningBriefing,
  getTodayBriefing,
  getOrCreateBackgroundCheck,
} from "./briefing.js";
import { getGoogleConnection } from "./google.js";

// Default check intervals (in milliseconds)
const EMAIL_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
const CALENDAR_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
const BRIEFING_CHECK_INTERVAL = 30 * 60 * 1000; // 30 minutes

// Track running state
let isRunning = false;
let emailCheckTimer: ReturnType<typeof setInterval> | null = null;
let calendarCheckTimer: ReturnType<typeof setInterval> | null = null;
let briefingCheckTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Get all users who have Google connected
 */
function getGoogleConnectedUsers(): string[] {
  const db = getDb();
  const users = db
    .prepare(`SELECT DISTINCT user_id FROM google_connections`)
    .all() as Array<{ user_id: string }>;
  return users.map((u) => u.user_id);
}

/**
 * Check if we should generate a morning briefing for a user
 */
function shouldGenerateBriefing(userId: string): boolean {
  const hour = new Date().getHours();

  // Only generate morning briefings between 6 AM and 10 AM
  if (hour < 6 || hour >= 10) {
    return false;
  }

  // Check if we already have today's briefing
  const existingBriefing = getTodayBriefing(userId, "morning");
  if (existingBriefing) {
    return false;
  }

  return true;
}

/**
 * Run email checks for all connected users
 */
async function runEmailChecks(): Promise<void> {
  const users = getGoogleConnectedUsers();

  for (const userId of users) {
    try {
      const newCount = await checkNewEmails(userId);
      if (newCount > 0) {
        console.log(`[Scheduler] Created ${newCount} email alerts for user ${userId}`);
      }
    } catch (error) {
      console.error(`[Scheduler] Email check failed for user ${userId}:`, error);
    }
  }
}

/**
 * Run calendar checks for all connected users
 */
async function runCalendarChecks(): Promise<void> {
  const users = getGoogleConnectedUsers();

  for (const userId of users) {
    try {
      const alertCount = await checkUpcomingEvents(userId);
      if (alertCount > 0) {
        console.log(`[Scheduler] Created ${alertCount} calendar alerts for user ${userId}`);
      }
    } catch (error) {
      console.error(`[Scheduler] Calendar check failed for user ${userId}:`, error);
    }
  }
}

/**
 * Run briefing generation for all users who need it
 */
async function runBriefingGeneration(): Promise<void> {
  const users = getGoogleConnectedUsers();

  for (const userId of users) {
    try {
      if (shouldGenerateBriefing(userId)) {
        await generateMorningBriefing(userId);
        console.log(`[Scheduler] Generated morning briefing for user ${userId}`);
      }
    } catch (error) {
      console.error(`[Scheduler] Briefing generation failed for user ${userId}:`, error);
    }
  }
}

/**
 * Initialize background check records for a user
 */
export function initializeBackgroundChecks(userId: string): void {
  getOrCreateBackgroundCheck(userId, "email");
  getOrCreateBackgroundCheck(userId, "calendar");
}

/**
 * Start the background scheduler
 */
export function startScheduler(): void {
  if (isRunning) {
    console.log("[Scheduler] Already running");
    return;
  }

  isRunning = true;
  console.log("[Scheduler] Starting background scheduler...");

  // Run initial checks after a short delay
  setTimeout(() => {
    runEmailChecks().catch(console.error);
    runCalendarChecks().catch(console.error);
    runBriefingGeneration().catch(console.error);
  }, 10000); // 10 second delay on startup

  // Set up periodic checks
  emailCheckTimer = setInterval(() => {
    runEmailChecks().catch(console.error);
  }, EMAIL_CHECK_INTERVAL);

  calendarCheckTimer = setInterval(() => {
    runCalendarChecks().catch(console.error);
  }, CALENDAR_CHECK_INTERVAL);

  briefingCheckTimer = setInterval(() => {
    runBriefingGeneration().catch(console.error);
  }, BRIEFING_CHECK_INTERVAL);

  console.log(`[Scheduler] Background scheduler started:
  - Email checks: every ${EMAIL_CHECK_INTERVAL / 60000} minutes
  - Calendar checks: every ${CALENDAR_CHECK_INTERVAL / 60000} minutes
  - Briefing checks: every ${BRIEFING_CHECK_INTERVAL / 60000} minutes`);
}

/**
 * Stop the background scheduler
 */
export function stopScheduler(): void {
  if (!isRunning) {
    return;
  }

  isRunning = false;

  if (emailCheckTimer) {
    clearInterval(emailCheckTimer);
    emailCheckTimer = null;
  }

  if (calendarCheckTimer) {
    clearInterval(calendarCheckTimer);
    calendarCheckTimer = null;
  }

  if (briefingCheckTimer) {
    clearInterval(briefingCheckTimer);
    briefingCheckTimer = null;
  }

  console.log("[Scheduler] Background scheduler stopped");
}

/**
 * Check if the scheduler is running
 */
export function isSchedulerRunning(): boolean {
  return isRunning;
}

/**
 * Manually trigger a check for a specific user
 */
export async function triggerUserCheck(
  userId: string,
  checkType: "email" | "calendar" | "briefing" | "all"
): Promise<{ emailAlerts: number; calendarAlerts: number; briefingGenerated: boolean }> {
  const result = {
    emailAlerts: 0,
    calendarAlerts: 0,
    briefingGenerated: false,
  };

  if (checkType === "email" || checkType === "all") {
    result.emailAlerts = await checkNewEmails(userId);
  }

  if (checkType === "calendar" || checkType === "all") {
    result.calendarAlerts = await checkUpcomingEvents(userId);
  }

  if (checkType === "briefing" || checkType === "all") {
    const existing = getTodayBriefing(userId, "morning");
    if (!existing) {
      await generateMorningBriefing(userId);
      result.briefingGenerated = true;
    }
  }

  return result;
}
