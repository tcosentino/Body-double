/**
 * Context Building Service
 *
 * Builds rich context about users to inject into the AI companion's prompts.
 * This is the key to making the companion feel genuinely knowledgeable about the user.
 */

import crypto from "node:crypto";
import { getDb } from "../db/index.js";
import type { User, Session } from "../db/schema.js";
import { getMemorySummary, getRelevantMemories } from "./memory.js";

export interface UserContext {
  user: {
    name: string;
    workContext: string;
    interests: string[];
  };
  recentSessions: SessionSummary[];
  memories: {
    projects: string[];
    challenges: string[];
    insights: string[];
    distractions: string[];
    goals: string[];
    wins: string[];
    preferences: string[];
  };
  relevantMemories: string[]; // Memories relevant to current task
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
  const user = db
    .prepare(
      `
    SELECT * FROM users WHERE id = ?
  `
    )
    .get(userId) as User | undefined;

  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  // Get recent sessions (last 10, excluding current)
  const recentSessions = db
    .prepare(
      `
    SELECT * FROM sessions
    WHERE user_id = ? AND status = 'completed' AND id != ?
    ORDER BY ended_at DESC
    LIMIT 10
  `
    )
    .all(userId, currentSessionId || "") as Session[];

  // Get current session if provided
  let currentSession: UserContext["currentSession"] | undefined;
  let declaredTask = "";
  if (currentSessionId) {
    const session = db
      .prepare(
        `
      SELECT * FROM sessions WHERE id = ?
    `
      )
      .get(currentSessionId) as Session | undefined;

    if (session) {
      declaredTask = session.declared_task || "";
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

  // Get memories from the enhanced memory service
  const memorySummary = getMemorySummary(userId);

  // Get memories relevant to the current task
  const relevantMems = declaredTask ? getRelevantMemories(userId, declaredTask) : [];

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
    memories: {
      projects: memorySummary.projects,
      challenges: memorySummary.challenges,
      insights: memorySummary.insights,
      distractions: memorySummary.distractions,
      goals: memorySummary.goals,
      wins: memorySummary.wins,
      preferences: memorySummary.preferences,
    },
    relevantMemories: relevantMems.map((m) => `[${m.category}] ${m.content}`),
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
  distractions: string;
  insights: string;
  goals: string;
  recentWins: string;
  preferences: string;
  recentSessions: string;
  relevantContext: string;
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

  // Format relevant context for current task
  const relevantContext =
    context.relevantMemories.length > 0
      ? context.relevantMemories.join("\n")
      : "No specific context for this task yet";

  return {
    userName: context.user.name,
    workContext: context.user.workContext,
    currentProjects: formatList(context.memories.projects),
    interests:
      context.user.interests.length > 0 ? context.user.interests.join(", ") : "Not yet shared",
    challenges: formatList(context.memories.challenges),
    distractions: formatList(context.memories.distractions),
    insights: formatList(context.memories.insights),
    goals: formatList(context.memories.goals),
    recentWins: formatList(context.memories.wins),
    preferences: formatList(context.memories.preferences),
    recentSessions: recentSessionsText,
    relevantContext,
    declaredTask: context.currentSession?.declaredTask || "Not specified",
    sessionDuration: `${context.currentSession?.durationPlanned || 25} minutes`,
    checkInFrequency: `every ${context.currentSession?.checkInFrequency || 15} minutes`,
  };
}

/**
 * Add a context item for a user (legacy - use memory service instead)
 */
export function addContextItem(
  userId: string,
  category: "project" | "interest" | "challenge" | "insight",
  content: string,
  importance: number = 1
) {
  const db = getDb();
  const id = crypto.randomUUID();

  db.prepare(
    `
    INSERT INTO user_context_items (id, user_id, category, content, importance)
    VALUES (?, ?, ?, ?, ?)
  `
  ).run(id, userId, category, content, importance);

  return db.prepare(`SELECT * FROM user_context_items WHERE id = ?`).get(id);
}

/**
 * Update the last_referenced timestamp for a context item
 */
export function touchContextItem(itemId: string): void {
  const db = getDb();
  db.prepare(
    `
    UPDATE user_context_items
    SET last_referenced = datetime('now')
    WHERE id = ?
  `
  ).run(itemId);
}
