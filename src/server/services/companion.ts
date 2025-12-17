/**
 * AI Companion Service
 *
 * Wraps the Anthropic API and handles conversation with context injection.
 */

import crypto from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { getDb } from "../db/index.js";
import { buildUserContext, formatContextForPrompt } from "./context.js";
import { buildPrompt, systemPromptV1 } from "../../../prompts/system-prompt.js";
import type { Message } from "../db/schema.js";

// Use the prompt version - can be made configurable later
const SYSTEM_PROMPT_TEMPLATE = systemPromptV1;

let anthropic: Anthropic | null = null;

function getAnthropic(): Anthropic {
  if (!anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required");
    }
    anthropic = new Anthropic();
  }
  return anthropic;
}

export interface CompanionMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Generate a response from the AI companion
 */
export async function generateResponse(
  userId: string,
  sessionId: string,
  userMessage: string
): Promise<string> {
  const db = getDb();
  const client = getAnthropic();

  // Build context and system prompt
  const context = buildUserContext(userId, sessionId);
  const formattedContext = formatContextForPrompt(context);
  const systemPrompt = buildPrompt(SYSTEM_PROMPT_TEMPLATE, formattedContext);

  // Get conversation history for this session
  const messages = db
    .prepare(
      `
    SELECT role, content FROM messages
    WHERE session_id = ?
    ORDER BY created_at ASC
  `
    )
    .all(sessionId) as CompanionMessage[];

  // Add the new user message
  messages.push({ role: "user", content: userMessage });

  // Call the API
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  });

  const assistantMessage = response.content[0].type === "text" ? response.content[0].text : "";

  return assistantMessage;
}

/**
 * Generate a streaming response from the AI companion
 */
export async function* generateStreamingResponse(
  userId: string,
  sessionId: string,
  userMessage: string
): AsyncGenerator<string> {
  const db = getDb();
  const client = getAnthropic();

  // Build context and system prompt
  const context = buildUserContext(userId, sessionId);
  const formattedContext = formatContextForPrompt(context);
  const systemPrompt = buildPrompt(SYSTEM_PROMPT_TEMPLATE, formattedContext);

  // Get conversation history for this session
  const messages = db
    .prepare(
      `
    SELECT role, content FROM messages
    WHERE session_id = ?
    ORDER BY created_at ASC
  `
    )
    .all(sessionId) as CompanionMessage[];

  // Add the new user message
  messages.push({ role: "user", content: userMessage });

  // Call the API with streaming
  const stream = await client.messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
}

/**
 * Save a message to the database
 */
export function saveMessage(
  sessionId: string,
  role: "user" | "assistant",
  content: string
): Message {
  const db = getDb();
  const id = crypto.randomUUID();

  db.prepare(
    `
    INSERT INTO messages (id, session_id, role, content)
    VALUES (?, ?, ?, ?)
  `
  ).run(id, sessionId, role, content);

  return db.prepare(`SELECT * FROM messages WHERE id = ?`).get(id) as Message;
}

/**
 * Get the session greeting when a session starts
 */
export async function getSessionGreeting(userId: string, sessionId: string): Promise<string> {
  const context = buildUserContext(userId, sessionId);

  // Create a greeting prompt based on context
  const isFirstSession = context.recentSessions.length === 0;
  const task = context.currentSession?.declaredTask || "your task";

  let greetingPrompt: string;

  if (isFirstSession) {
    greetingPrompt = `This is the start of your first session together. The user, ${context.user.name}, is about to work on: "${task}". Give a brief, warm greeting that acknowledges this is your first time working together. Ask them to tell you a bit about themselves and what they're working on. Keep it concise (2-3 sentences).`;
  } else {
    const lastSession = context.recentSessions[0];
    greetingPrompt = `This is the start of a new session. ${context.user.name} is about to work on: "${task}". Their last session was working on "${lastSession.task}". Give a brief, warm greeting that naturally references something from your history together. Keep it concise (2-3 sentences).`;
  }

  // Generate greeting using a simpler prompt
  const client = getAnthropic();
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 256,
    system: `You are a warm, genuine work companion who knows ${context.user.name} well. Be natural and concise.`,
    messages: [{ role: "user", content: greetingPrompt }],
  });

  return response.content[0].type === "text" ? response.content[0].text : "";
}
