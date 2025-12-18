/**
 * Briefing Service
 *
 * Generates morning briefings by aggregating data from:
 * - Google Calendar (today's events)
 * - Gmail (recent/unread emails)
 * - Notion (tasks, if connected)
 *
 * Also handles creating alerts and notifications.
 */

import crypto from "node:crypto";
import { getDb } from "../db/index.js";
import type {
  Alert,
  AlertInput,
  Briefing,
  BriefingInput,
  BriefingType,
  BackgroundCheck,
  BackgroundCheckType,
} from "../db/schema.js";
import { getGoogleConnection, getTodayEvents, listEmails, getUnreadCount } from "./google.js";
import { getNotionConnection } from "./notion.js";

// ============================================
// Alert Management
// ============================================

/**
 * Create a new alert for a user
 */
export function createAlert(userId: string, input: AlertInput): Alert {
  const db = getDb();
  const id = crypto.randomUUID();

  db.prepare(
    `
    INSERT INTO alerts (id, user_id, type, title, content, priority, source_type, source_id, action_type, action_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    id,
    userId,
    input.type,
    input.title,
    input.content,
    input.priority || "normal",
    input.source_type || null,
    input.source_id || null,
    input.action_type || null,
    input.action_data ? JSON.stringify(input.action_data) : null
  );

  return db.prepare(`SELECT * FROM alerts WHERE id = ?`).get(id) as Alert;
}

/**
 * Get alerts for a user
 */
export function getAlerts(
  userId: string,
  options: {
    status?: string;
    type?: string;
    limit?: number;
    offset?: number;
  } = {}
): { alerts: Alert[]; total: number } {
  const db = getDb();
  const { status, type, limit = 50, offset = 0 } = options;

  let query = `SELECT * FROM alerts WHERE user_id = ?`;
  let countQuery = `SELECT COUNT(*) as count FROM alerts WHERE user_id = ?`;
  const params: (string | number)[] = [userId];

  if (status) {
    query += ` AND status = ?`;
    countQuery += ` AND status = ?`;
    params.push(status);
  }

  if (type) {
    query += ` AND type = ?`;
    countQuery += ` AND type = ?`;
    params.push(type);
  }

  query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  const queryParams = [...params, limit, offset];
  const countParams = params;

  const alerts = db.prepare(query).all(...queryParams) as Alert[];
  const total = (db.prepare(countQuery).get(...countParams) as { count: number }).count;

  return { alerts, total };
}

/**
 * Get unread alert count for a user
 */
export function getUnreadAlertCount(userId: string): number {
  const db = getDb();
  const result = db
    .prepare(`SELECT COUNT(*) as count FROM alerts WHERE user_id = ? AND status = 'unread'`)
    .get(userId) as { count: number };
  return result.count;
}

/**
 * Mark an alert as read
 */
export function markAlertRead(userId: string, alertId: string): boolean {
  const db = getDb();
  const result = db
    .prepare(
      `UPDATE alerts SET status = 'read', read_at = datetime('now') WHERE id = ? AND user_id = ?`
    )
    .run(alertId, userId);
  return result.changes > 0;
}

/**
 * Mark all alerts as read
 */
export function markAllAlertsRead(userId: string): number {
  const db = getDb();
  const result = db
    .prepare(
      `UPDATE alerts SET status = 'read', read_at = datetime('now') WHERE user_id = ? AND status = 'unread'`
    )
    .run(userId);
  return result.changes;
}

/**
 * Dismiss an alert
 */
export function dismissAlert(userId: string, alertId: string): boolean {
  const db = getDb();
  const result = db
    .prepare(
      `UPDATE alerts SET status = 'dismissed', dismissed_at = datetime('now') WHERE id = ? AND user_id = ?`
    )
    .run(alertId, userId);
  return result.changes > 0;
}

/**
 * Delete old alerts (cleanup)
 */
export function cleanupOldAlerts(daysToKeep: number = 7): number {
  const db = getDb();
  const result = db
    .prepare(
      `DELETE FROM alerts WHERE created_at < datetime('now', '-' || ? || ' days') AND status IN ('read', 'dismissed')`
    )
    .run(daysToKeep);
  return result.changes;
}

// ============================================
// Briefing Management
// ============================================

/**
 * Save a briefing to the database
 */
export function saveBriefing(userId: string, input: BriefingInput): Briefing {
  const db = getDb();
  const id = crypto.randomUUID();

  // Delete existing briefing for this date/type if exists
  db.prepare(`DELETE FROM briefings WHERE user_id = ? AND date = ? AND type = ?`).run(
    userId,
    input.date,
    input.type
  );

  db.prepare(
    `
    INSERT INTO briefings (id, user_id, date, type, summary, calendar_events, emails, tasks)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    id,
    userId,
    input.date,
    input.type,
    input.summary,
    input.calendar_events ? JSON.stringify(input.calendar_events) : null,
    input.emails ? JSON.stringify(input.emails) : null,
    input.tasks ? JSON.stringify(input.tasks) : null
  );

  return db.prepare(`SELECT * FROM briefings WHERE id = ?`).get(id) as Briefing;
}

/**
 * Get today's briefing for a user
 */
export function getTodayBriefing(userId: string, type: BriefingType = "morning"): Briefing | null {
  const db = getDb();
  const today = new Date().toISOString().split("T")[0];

  return (
    (db
      .prepare(`SELECT * FROM briefings WHERE user_id = ? AND date = ? AND type = ?`)
      .get(userId, today, type) as Briefing) || null
  );
}

/**
 * Get recent briefings for a user
 */
export function getRecentBriefings(userId: string, limit: number = 7): Briefing[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM briefings WHERE user_id = ? ORDER BY date DESC LIMIT ?`)
    .all(userId, limit) as Briefing[];
}

/**
 * Mark a briefing as viewed
 */
export function markBriefingViewed(userId: string, briefingId: string): boolean {
  const db = getDb();
  const result = db
    .prepare(`UPDATE briefings SET viewed_at = datetime('now') WHERE id = ? AND user_id = ?`)
    .run(briefingId, userId);
  return result.changes > 0;
}

// ============================================
// Background Check Tracking
// ============================================

/**
 * Get or create background check record for a user
 */
export function getOrCreateBackgroundCheck(
  userId: string,
  checkType: BackgroundCheckType
): BackgroundCheck {
  const db = getDb();

  let check = db
    .prepare(`SELECT * FROM background_checks WHERE user_id = ? AND check_type = ?`)
    .get(userId, checkType) as BackgroundCheck | undefined;

  if (!check) {
    const id = crypto.randomUUID();
    db.prepare(`INSERT INTO background_checks (id, user_id, check_type) VALUES (?, ?, ?)`).run(
      id,
      userId,
      checkType
    );
    check = db.prepare(`SELECT * FROM background_checks WHERE id = ?`).get(id) as BackgroundCheck;
  }

  return check;
}

/**
 * Update last checked timestamp and item ID
 */
export function updateBackgroundCheck(
  userId: string,
  checkType: BackgroundCheckType,
  lastItemId?: string
): void {
  const db = getDb();
  if (lastItemId) {
    db.prepare(
      `UPDATE background_checks SET last_checked_at = datetime('now'), last_item_id = ? WHERE user_id = ? AND check_type = ?`
    ).run(lastItemId, userId, checkType);
  } else {
    db.prepare(
      `UPDATE background_checks SET last_checked_at = datetime('now') WHERE user_id = ? AND check_type = ?`
    ).run(userId, checkType);
  }
}

/**
 * Get all users who need background checks
 */
export function getUsersNeedingCheck(checkType: BackgroundCheckType): string[] {
  const db = getDb();

  // Get users with the check type enabled where:
  // - Never checked, OR
  // - Last check was more than check_interval_minutes ago
  const users = db
    .prepare(
      `
    SELECT DISTINCT bc.user_id
    FROM background_checks bc
    WHERE bc.check_type = ?
    AND bc.enabled = 1
    AND (
      bc.last_checked_at IS NULL
      OR datetime(bc.last_checked_at, '+' || bc.check_interval_minutes || ' minutes') < datetime('now')
    )
  `
    )
    .all(checkType) as Array<{ user_id: string }>;

  return users.map((u) => u.user_id);
}

// ============================================
// Briefing Generation
// ============================================

interface BriefingData {
  calendarEvents: Array<{
    id: string;
    summary: string;
    start: string;
    end: string;
    location?: string;
  }>;
  emails: Array<{
    id: string;
    from: string;
    subject: string;
    snippet: string;
    date: string;
  }>;
  unreadCount: number;
  tasks: Array<{
    id: string;
    title: string;
    status?: string;
    due?: string;
  }>;
  hasGoogle: boolean;
  hasNotion: boolean;
}

/**
 * Gather all data needed for a briefing
 */
export async function gatherBriefingData(userId: string): Promise<BriefingData> {
  const googleConnection = getGoogleConnection(userId);
  const notionConnection = getNotionConnection(userId);

  const data: BriefingData = {
    calendarEvents: [],
    emails: [],
    unreadCount: 0,
    tasks: [],
    hasGoogle: !!googleConnection,
    hasNotion: !!notionConnection,
  };

  // Fetch Google Calendar events
  if (googleConnection) {
    const events = await getTodayEvents(userId, "proactive_check");
    if (events) {
      data.calendarEvents = events.map((e) => ({
        id: e.id,
        summary: e.summary || "(No title)",
        start: e.start.dateTime || e.start.date || "",
        end: e.end.dateTime || e.end.date || "",
        location: e.location,
      }));
    }

    // Fetch recent emails
    const emails = await listEmails(userId, {
      maxResults: 10,
      query: "is:unread OR newer_than:1d",
      triggeredBy: "proactive_check",
    });
    if (emails) {
      data.emails = emails.map((e) => {
        const headers = e.payload?.headers || [];
        const from = headers.find((h) => h.name === "From")?.value || "Unknown";
        const subject = headers.find((h) => h.name === "Subject")?.value || "(No subject)";
        const date = headers.find((h) => h.name === "Date")?.value || "";

        return {
          id: e.id,
          from,
          subject,
          snippet: e.snippet || "",
          date,
        };
      });
    }

    // Get unread count
    const unreadCount = await getUnreadCount(userId, "proactive_check");
    data.unreadCount = unreadCount ?? 0;
  }

  // TODO: Fetch Notion tasks when task database is configured
  // For now, tasks will be empty

  return data;
}

/**
 * Generate a morning briefing summary
 */
export function generateBriefingSummary(data: BriefingData): string {
  const parts: string[] = [];

  // Greeting based on time
  const hour = new Date().getHours();
  if (hour < 12) {
    parts.push("Good morning!");
  } else if (hour < 17) {
    parts.push("Good afternoon!");
  } else {
    parts.push("Good evening!");
  }

  parts.push("");

  // Calendar summary
  if (data.calendarEvents.length > 0) {
    parts.push(`**Today's Schedule** (${data.calendarEvents.length} events)`);
    for (const event of data.calendarEvents.slice(0, 5)) {
      const time = event.start
        ? new Date(event.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "All day";
      parts.push(`- ${time}: ${event.summary}`);
    }
    if (data.calendarEvents.length > 5) {
      parts.push(`  ...and ${data.calendarEvents.length - 5} more events`);
    }
    parts.push("");
  } else if (data.hasGoogle) {
    parts.push("**Today's Schedule**: No events scheduled for today.");
    parts.push("");
  }

  // Email summary
  if (data.unreadCount > 0 || data.emails.length > 0) {
    parts.push(`**Email** (${data.unreadCount} unread)`);
    const recentUnread = data.emails.slice(0, 3);
    for (const email of recentUnread) {
      const fromName = email.from.split("<")[0].trim() || email.from;
      parts.push(`- From ${fromName}: ${email.subject}`);
    }
    if (data.unreadCount > 3) {
      parts.push(`  ...and ${data.unreadCount - 3} more unread emails`);
    }
    parts.push("");
  } else if (data.hasGoogle) {
    parts.push("**Email**: All caught up! No unread emails.");
    parts.push("");
  }

  // Tasks summary
  if (data.tasks.length > 0) {
    parts.push(`**Tasks** (${data.tasks.length} items)`);
    for (const task of data.tasks.slice(0, 5)) {
      const status = task.status ? ` [${task.status}]` : "";
      parts.push(`- ${task.title}${status}`);
    }
    parts.push("");
  }

  // Connection status if nothing connected
  if (!data.hasGoogle && !data.hasNotion) {
    parts.push(
      "Connect Google or Notion in Settings to see your calendar, emails, and tasks in your briefing."
    );
  } else if (!data.hasGoogle) {
    parts.push("Tip: Connect Google in Settings to see your calendar and emails in your briefing.");
  }

  return parts.join("\n");
}

/**
 * Generate and save a morning briefing for a user
 */
export async function generateMorningBriefing(userId: string): Promise<Briefing> {
  const data = await gatherBriefingData(userId);
  const summary = generateBriefingSummary(data);
  const today = new Date().toISOString().split("T")[0];

  // Save the briefing
  const briefing = saveBriefing(userId, {
    date: today,
    type: "morning",
    summary,
    calendar_events: data.calendarEvents,
    emails: data.emails,
    tasks: data.tasks,
  });

  // Create a briefing alert
  createAlert(userId, {
    type: "briefing",
    title: "Morning Briefing Ready",
    content: `Your briefing for ${today} is ready. You have ${data.calendarEvents.length} events and ${data.unreadCount} unread emails.`,
    priority: "normal",
    source_type: "system",
    action_type: "spawn_chat",
    action_data: { topic: "morning_briefing", briefingId: briefing.id },
  });

  return briefing;
}

// ============================================
// Email Monitoring
// ============================================

/**
 * Check for new emails and create alerts for important ones
 */
export async function checkNewEmails(userId: string): Promise<number> {
  const googleConnection = getGoogleConnection(userId);
  if (!googleConnection) return 0;

  const check = getOrCreateBackgroundCheck(userId, "email");
  const lastCheckedId = check.last_item_id;

  // Get recent emails
  const emails = await listEmails(userId, {
    maxResults: 20,
    query: "is:unread",
    triggeredBy: "proactive_check",
  });

  if (!emails || emails.length === 0) {
    updateBackgroundCheck(userId, "email");
    return 0;
  }

  let newEmailCount = 0;
  const newestId = emails[0]?.id;

  for (const email of emails) {
    // Stop if we've reached the last checked email
    if (email.id === lastCheckedId) break;

    const headers = email.payload?.headers || [];
    const from = headers.find((h) => h.name === "From")?.value || "Unknown sender";
    const subject = headers.find((h) => h.name === "Subject")?.value || "(No subject)";
    const fromName = from.split("<")[0].trim() || from;

    // Determine priority based on sender/subject
    // TODO: Make this smarter with user preferences
    const isHighPriority =
      subject.toLowerCase().includes("urgent") ||
      subject.toLowerCase().includes("important") ||
      subject.toLowerCase().includes("action required");

    createAlert(userId, {
      type: "email",
      title: `New email from ${fromName}`,
      content: subject,
      priority: isHighPriority ? "high" : "normal",
      source_type: "gmail",
      source_id: email.id,
      action_type: "open_email",
      action_data: { emailId: email.id, threadId: email.threadId },
    });

    newEmailCount++;
  }

  // Update the last checked ID
  if (newestId) {
    updateBackgroundCheck(userId, "email", newestId);
  }

  return newEmailCount;
}

/**
 * Check for upcoming calendar events and create reminders
 */
export async function checkUpcomingEvents(userId: string): Promise<number> {
  const googleConnection = getGoogleConnection(userId);
  if (!googleConnection) return 0;

  // Get events starting in the next 15 minutes
  const now = new Date();
  const soon = new Date(now.getTime() + 15 * 60 * 1000);

  const events = await getTodayEvents(userId, "proactive_check");
  if (!events) return 0;

  let alertCount = 0;

  for (const event of events) {
    const startTime = event.start.dateTime ? new Date(event.start.dateTime) : null;
    if (!startTime) continue;

    // Check if event starts within 15 minutes
    if (startTime > now && startTime <= soon) {
      const minutesUntil = Math.round((startTime.getTime() - now.getTime()) / 60000);

      // Check if we already have an alert for this event
      const db = getDb();
      const existingAlert = db
        .prepare(
          `SELECT id FROM alerts WHERE user_id = ? AND source_type = 'calendar' AND source_id = ? AND created_at > datetime('now', '-1 hour')`
        )
        .get(userId, event.id);

      if (!existingAlert) {
        createAlert(userId, {
          type: "calendar",
          title: `${event.summary} starts in ${minutesUntil} minutes`,
          content: event.location ? `Location: ${event.location}` : "No location specified",
          priority: minutesUntil <= 5 ? "urgent" : "high",
          source_type: "calendar",
          source_id: event.id,
          action_type: "open_event",
          action_data: { eventId: event.id },
        });
        alertCount++;
      }
    }
  }

  updateBackgroundCheck(userId, "calendar");
  return alertCount;
}
