/**
 * Context Building Service
 *
 * Builds rich context about users to inject into the AI companion's prompts.
 * This is the key to making the companion feel genuinely knowledgeable about the user.
 */

import { getDb } from "../db/index.js";
import type { User, Session, UserContextItem } from "../db/schema.js";

export interface UserContext {
  user: {
    name: string;
    workContext: string;
    interests: string[];
  };
  recentSessions: SessionSummary[];
  contextItems: {
    projects: string[];
    challenges: string[];
    insights: string[];
  };
  currentSession?: {
    declaredTask: string;
    durationPlanned: number;
    checkInFrequency: number;
  };
}

export interface SessionSummary {
  date: string;
  task: string;
  outcome: string | null;
  durationMinutes: number;
}

/**
 * Get comprehensive context for a user to inject into prompts
 */
export function buildUserContext(userId: string, currentSessionId?: string): UserContext {
  const db = getDb();

  // Get user info
  const user = db.prepare(`
    SELECT * FROM users WHERE id = ?
  `).get(userId) as User | undefined;

  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  // Get recent sessions (last 10, excluding current)
  const recentSessions = db.prepare(`
    SELECT * FROM sessions
    WHERE user_id = ? AND status = 'completed' AND id != ?
    ORDER BY ended_at DESC
    LIMIT 10
  `).all(userId, currentSessionId || "") as Session[];

  // Get context items by category
  const contextItems = db.prepare(`
    SELECT * FROM user_context_items
    WHERE user_id = ?
    ORDER BY importance DESC, last_referenced DESC
  `).all(userId) as UserContextItem[];

  // Get current session if provided
  let currentSession: UserContext["currentSession"] | undefined;
  if (currentSessionId) {
    const session = db.prepare(`
      SELECT * FROM sessions WHERE id = ?
    `).get(currentSessionId) as Session | undefined;

    if (session) {
      currentSession = {
        declaredTask: session.declared_task || "Not specified",
        durationPlanned: session.duration_planned || 25,
        checkInFrequency: session.check_in_frequency,
      };
    }
  }

  // Parse interests from JSON
  let interests: string[] = [];
  if (user.interests) {
    try {
      interests = JSON.parse(user.interests);
    } catch {
      interests = [];
    }
  }

  // Group context items by category
  const projects = contextItems
    .filter((c) => c.category === "project")
    .map((c) => c.content);
  const challenges = contextItems
    .filter((c) => c.category === "challenge")
    .map((c) => c.content);
  const insights = contextItems
    .filter((c) => c.category === "insight")
    .map((c) => c.content);

  return {
    user: {
      name: user.name,
      workContext: user.work_context || "Not yet shared",
      interests,
    },
    recentSessions: recentSessions.map((s) => ({
      date: s.ended_at || s.started_at,
      task: s.declared_task || "Unspecified task",
      outcome: s.outcome,
      durationMinutes: s.duration_actual || s.duration_planned || 0,
    })),
    contextItems: {
      projects,
      challenges,
      insights,
    },
    currentSession,
  };
}

/**
 * Format context for injection into system prompt
 */
export function formatContextForPrompt(context: UserContext): {
  userName: string;
  workContext: string;
  currentProjects: string;
  interests: string;
  challenges: string;
  recentSessions: string;
  declaredTask: string;
  sessionDuration: string;
  checkInFrequency: string;
} {
  // Format recent sessions
  let recentSessionsText = "This is your first session together.";
  if (context.recentSessions.length > 0) {
    recentSessionsText = context.recentSessions
      .slice(0, 5)
      .map((s) => {
        const date = new Date(s.date).toLocaleDateString("en-US", {
          weekday: "long",
          month: "short",
          day: "numeric",
        });
        const outcome = s.outcome ? ` ${s.outcome}` : "";
        return `**${date} (${s.durationMinutes} min):** ${s.task}.${outcome}`;
      })
      .join("\n\n");
  }

  // Format lists
  const formatList = (items: string[]): string =>
    items.length > 0 ? items.map((i) => `- ${i}`).join("\n") : "Not yet shared";

  return {
    userName: context.user.name,
    workContext: context.user.workContext,
    currentProjects: formatList(context.contextItems.projects),
    interests: context.user.interests.length > 0
      ? context.user.interests.join(", ")
      : "Not yet shared",
    challenges: formatList(context.contextItems.challenges),
    recentSessions: recentSessionsText,
    declaredTask: context.currentSession?.declaredTask || "Not specified",
    sessionDuration: `${context.currentSession?.durationPlanned || 25} minutes`,
    checkInFrequency: `every ${context.currentSession?.checkInFrequency || 15} minutes`,
  };
}

/**
 * Add a context item for a user
 */
export function addContextItem(
  userId: string,
  category: UserContextItem["category"],
  content: string,
  importance: number = 1
): UserContextItem {
  const db = getDb();
  const id = crypto.randomUUID();

  db.prepare(`
    INSERT INTO user_context_items (id, user_id, category, content, importance)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, userId, category, content, importance);

  return db.prepare(`SELECT * FROM user_context_items WHERE id = ?`).get(id) as UserContextItem;
}

/**
 * Update the last_referenced timestamp for a context item
 */
export function touchContextItem(itemId: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE user_context_items
    SET last_referenced = datetime('now')
    WHERE id = ?
  `).run(itemId);
}
