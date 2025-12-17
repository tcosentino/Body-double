#!/usr/bin/env node
/**
 * Chat Demo Script
 *
 * Non-interactive script that runs sample conversations and outputs results.
 * Used in CI to generate artifact showing how the companion responds.
 *
 * Usage:
 *   npm run demo:chat
 */

import Anthropic from "@anthropic-ai/sdk";
import { buildPrompt, promptVersions } from "../prompts/system-prompt.js";
import { allScenarios, type TestScenario } from "../prompts/user-contexts.js";

// Check for API key
if (!process.env.ANTHROPIC_API_KEY) {
  console.log("⚠️  ANTHROPIC_API_KEY not set - skipping chat demo");
  console.log("   Set the secret in GitHub to enable chat demos.\n");
  process.exit(0);
}

const anthropic = new Anthropic();

interface Message {
  role: "user" | "assistant";
  content: string;
}

async function runScenarioDemo(scenario: TestScenario): Promise<void> {
  console.log("\n" + "═".repeat(70));
  console.log(`  SCENARIO: ${scenario.name}`);
  console.log(`  ${scenario.description}`);
  console.log("═".repeat(70));
  console.log(`\n  Task: "${scenario.context.declaredTask}"`);
  console.log(`  Duration: ${scenario.context.sessionDuration}`);
  console.log("\n" + "─".repeat(70) + "\n");

  const systemPrompt = buildPrompt(promptVersions.v1.template, scenario.context);

  const conversationHistory: Message[] = [];

  // Run through first 3 test questions to keep it brief
  const questions = scenario.testQuestions.slice(0, 3);

  for (const question of questions) {
    console.log(`👤 USER: ${question}\n`);

    conversationHistory.push({ role: "user", content: question });

    try {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 512,
        system: systemPrompt,
        messages: conversationHistory,
      });

      const assistantMessage = response.content[0].type === "text" ? response.content[0].text : "";

      console.log(`🤖 COMPANION: ${assistantMessage}\n`);
      console.log("─".repeat(70) + "\n");

      conversationHistory.push({ role: "assistant", content: assistantMessage });

      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 1000));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`❌ ERROR: ${message}\n`);
    }
  }
}

async function main(): Promise<void> {
  console.log("\n" + "╔" + "═".repeat(68) + "╗");
  console.log("║" + "  🎯 BODY DOUBLE - SAMPLE CHAT DEMO".padEnd(68) + "║");
  console.log("║" + "  Generated during CI to show companion behavior".padEnd(68) + "║");
  console.log("╚" + "═".repeat(68) + "╝");
  console.log(`\n  Timestamp: ${new Date().toISOString()}`);
  console.log(`  Prompt Version: ${promptVersions.v1.name}`);

  // Run demos for first 2 scenarios to keep CI fast
  const scenariosToRun = allScenarios.slice(0, 2);

  for (const scenario of scenariosToRun) {
    await runScenarioDemo(scenario);
  }

  console.log("\n" + "═".repeat(70));
  console.log("  ✅ DEMO COMPLETE");
  console.log("═".repeat(70) + "\n");
}

main().catch((error) => {
  console.error("Demo failed:", error);
  process.exit(1);
});
