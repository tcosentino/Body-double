#!/usr/bin/env node
/**
 * Batch Prompt Tester
 *
 * Generates example conversations for all prompt/scenario combinations
 * and saves them to markdown files for review and comparison.
 *
 * Usage:
 *   npm run test:batch              # Run all combinations
 *   npm run test:batch -- --dry-run # Preview prompts without API calls
 *   npm run test:batch -- --scenario=1 --prompt=v1  # Run specific combo
 */

import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";
import { buildPrompt, promptVersions } from "../prompts/system-prompt.js";
import { allScenarios, type TestScenario } from "../prompts/user-contexts.js";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ConversationResult {
  promptVersion: string;
  promptName: string;
  scenario: TestScenario;
  systemPrompt: string;
  conversation: Message[];
  timestamp: string;
}

const OUTPUT_DIR = "test-outputs";

function parseArgs(): {
  dryRun: boolean;
  scenario?: number;
  prompt?: string;
} {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes("--dry-run"),
    scenario: args.find((a) => a.startsWith("--scenario="))?.split("=")[1]
      ? parseInt(args.find((a) => a.startsWith("--scenario="))!.split("=")[1])
      : undefined,
    prompt: args.find((a) => a.startsWith("--prompt="))?.split("=")[1],
  };
}

async function runConversation(
  anthropic: Anthropic,
  systemPrompt: string,
  testQuestions: string[]
): Promise<Message[]> {
  const conversation: Message[] = [];

  for (const question of testQuestions) {
    conversation.push({ role: "user", content: question });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages: conversation,
    });

    const assistantMessage = response.content[0].type === "text" ? response.content[0].text : "";

    conversation.push({ role: "assistant", content: assistantMessage });

    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 300));
  }

  return conversation;
}

function formatConversationMarkdown(result: ConversationResult): string {
  let md = `# ${result.scenario.name} + ${result.promptName}\n\n`;
  md += `**Generated:** ${result.timestamp}\n\n`;
  md += `**Scenario:** ${result.scenario.description}\n\n`;
  md += `**Task:** ${result.scenario.context.declaredTask}\n\n`;
  md += `---\n\n`;
  md += `## Conversation\n\n`;

  for (const msg of result.conversation) {
    if (msg.role === "user") {
      md += `### User\n\n${msg.content}\n\n`;
    } else {
      md += `### Companion\n\n${msg.content}\n\n`;
    }
  }

  md += `---\n\n`;
  md += `<details>\n<summary>System Prompt Used</summary>\n\n`;
  md += `\`\`\`\n${result.systemPrompt}\n\`\`\`\n\n`;
  md += `</details>\n`;

  return md;
}

function formatComparisonMarkdown(scenario: TestScenario, results: ConversationResult[]): string {
  let md = `# Prompt Comparison: ${scenario.name}\n\n`;
  md += `**Scenario:** ${scenario.description}\n\n`;
  md += `**Task:** ${scenario.context.declaredTask}\n\n`;
  md += `This file shows how each prompt version responds to the same user inputs.\n\n`;
  md += `---\n\n`;

  const questionCount = scenario.testQuestions.length;

  for (let i = 0; i < questionCount; i++) {
    const userMessage = scenario.testQuestions[i];
    md += `## Exchange ${i + 1}\n\n`;
    md += `### User Says:\n\n> ${userMessage}\n\n`;

    for (const result of results) {
      const response = result.conversation[i * 2 + 1]?.content || "(no response)";
      md += `### ${result.promptName} Response:\n\n${response}\n\n`;
    }

    md += `---\n\n`;
  }

  return md;
}

function formatDryRunMarkdown(
  promptVersion: string,
  promptName: string,
  scenario: TestScenario,
  systemPrompt: string
): string {
  let md = `# DRY RUN: ${scenario.name} + ${promptName}\n\n`;
  md += `**This is a preview - no API calls were made.**\n\n`;
  md += `## Scenario Details\n\n`;
  md += `- **Name:** ${scenario.name}\n`;
  md += `- **Description:** ${scenario.description}\n`;
  md += `- **Task:** ${scenario.context.declaredTask}\n`;
  md += `- **Session Duration:** ${scenario.context.sessionDuration}\n\n`;
  md += `## Test Questions That Would Be Sent\n\n`;

  scenario.testQuestions.forEach((q, i) => {
    md += `${i + 1}. "${q}"\n`;
  });

  md += `\n## System Prompt\n\n`;
  md += `\`\`\`\n${systemPrompt}\n\`\`\`\n`;

  return md;
}

async function main() {
  const args = parseArgs();

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Filter scenarios and prompts if specified
  const scenariosToRun = args.scenario ? [allScenarios[args.scenario - 1]] : allScenarios;

  const promptsToRun = args.prompt
    ? { [args.prompt]: promptVersions[args.prompt as keyof typeof promptVersions] }
    : promptVersions;

  if (args.dryRun) {
    console.log("\n🔍 DRY RUN MODE - Previewing prompts without API calls\n");

    for (const scenario of scenariosToRun) {
      for (const [version, { name, template }] of Object.entries(promptsToRun)) {
        const systemPrompt = buildPrompt(template, scenario.context);
        const content = formatDryRunMarkdown(version, name, scenario, systemPrompt);

        const filename = `dry-run_${scenario.name.toLowerCase().replace(/\s+/g, "-")}_${version}.md`;
        const filepath = path.join(OUTPUT_DIR, filename);
        fs.writeFileSync(filepath, content);

        console.log(`📄 ${filename}`);
      }
    }

    console.log(`\n✅ Dry run complete. Check the ${OUTPUT_DIR}/ directory.\n`);
    return;
  }

  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("\n❌ ANTHROPIC_API_KEY not set.");
    console.error("   Use --dry-run to preview prompts without API calls.\n");
    process.exit(1);
  }

  const anthropic = new Anthropic();
  const timestamp = new Date().toISOString();

  console.log("\n🚀 Running batch prompt tests...\n");

  // Run all combinations and collect results
  const allResults: Map<string, ConversationResult[]> = new Map();

  for (const scenario of scenariosToRun) {
    const scenarioResults: ConversationResult[] = [];

    for (const [version, { name, template }] of Object.entries(promptsToRun)) {
      const systemPrompt = buildPrompt(template, scenario.context);

      console.log(`⏳ ${scenario.name} + ${name}...`);

      const conversation = await runConversation(anthropic, systemPrompt, scenario.testQuestions);

      const result: ConversationResult = {
        promptVersion: version,
        promptName: name,
        scenario,
        systemPrompt,
        conversation,
        timestamp,
      };

      scenarioResults.push(result);

      // Save individual conversation
      const content = formatConversationMarkdown(result);
      const filename = `conversation_${scenario.name.toLowerCase().replace(/\s+/g, "-")}_${version}.md`;
      const filepath = path.join(OUTPUT_DIR, filename);
      fs.writeFileSync(filepath, content);

      console.log(`   ✅ Saved: ${filename}`);
    }

    allResults.set(scenario.name, scenarioResults);

    // Generate comparison file for this scenario
    if (Object.keys(promptsToRun).length > 1) {
      const comparisonContent = formatComparisonMarkdown(scenario, scenarioResults);
      const compFilename = `comparison_${scenario.name.toLowerCase().replace(/\s+/g, "-")}.md`;
      const compFilepath = path.join(OUTPUT_DIR, compFilename);
      fs.writeFileSync(compFilepath, comparisonContent);
      console.log(`   📊 Comparison: ${compFilename}`);
    }
  }

  // Generate summary index
  let indexMd = `# Prompt Test Results\n\n`;
  indexMd += `**Generated:** ${timestamp}\n\n`;
  indexMd += `## Files\n\n`;
  indexMd += `### Comparisons\n\n`;
  indexMd += `These show the same user inputs with different prompt styles side-by-side:\n\n`;

  for (const scenario of scenariosToRun) {
    const filename = `comparison_${scenario.name.toLowerCase().replace(/\s+/g, "-")}.md`;
    indexMd += `- [${scenario.name}](./${filename})\n`;
  }

  indexMd += `\n### Individual Conversations\n\n`;

  for (const scenario of scenariosToRun) {
    indexMd += `**${scenario.name}:**\n`;
    for (const version of Object.keys(promptsToRun)) {
      const filename = `conversation_${scenario.name.toLowerCase().replace(/\s+/g, "-")}_${version}.md`;
      indexMd += `- [${promptVersions[version as keyof typeof promptVersions].name}](./${filename})\n`;
    }
    indexMd += `\n`;
  }

  fs.writeFileSync(path.join(OUTPUT_DIR, "README.md"), indexMd);

  console.log(`\n✅ Batch testing complete!`);
  console.log(`   Results saved to ${OUTPUT_DIR}/`);
  console.log(`   Start with ${OUTPUT_DIR}/README.md\n`);
}

main().catch(console.error);
