#!/usr/bin/env node
/**
 * Prompt Testing Harness
 *
 * Interactive CLI for testing different system prompts and user scenarios.
 *
 * Usage:
 *   npm run test:prompts
 *
 * Commands during chat:
 *   /help          - Show available commands
 *   /prompt        - Show current system prompt
 *   /switch <v1|v2|v3> - Switch prompt version
 *   /scenario      - List and switch scenarios
 *   /auto          - Run through test questions automatically
 *   /reset         - Clear conversation history
 *   /quit          - Exit
 */

import Anthropic from "@anthropic-ai/sdk";
import * as readline from "readline";
import {
  buildPrompt,
  promptVersions,
  type PromptContext,
} from "../prompts/system-prompt.js";
import { allScenarios, type TestScenario } from "../prompts/user-contexts.js";

// Check for API key
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("\n❌ ANTHROPIC_API_KEY not set.");
  console.error("   Copy .env.example to .env and add your API key.\n");
  process.exit(1);
}

const anthropic = new Anthropic();

interface Message {
  role: "user" | "assistant";
  content: string;
}

class PromptTester {
  private currentPromptVersion: keyof typeof promptVersions = "v1";
  private currentScenario: TestScenario = allScenarios[0];
  private conversationHistory: Message[] = [];
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  private getSystemPrompt(): string {
    const template = promptVersions[this.currentPromptVersion].template;
    return buildPrompt(template, this.currentScenario.context);
  }

  private printHeader(): void {
    console.log("\n" + "=".repeat(60));
    console.log("  🎯 Body Double - Prompt Testing Harness");
    console.log("=".repeat(60));
    console.log(`\n  Prompt: ${promptVersions[this.currentPromptVersion].name} (${this.currentPromptVersion})`);
    console.log(`  Scenario: ${this.currentScenario.name}`);
    console.log(`  Task: ${this.currentScenario.context.declaredTask}`);
    console.log("\n  Type /help for commands, or start chatting.\n");
    console.log("-".repeat(60) + "\n");
  }

  private printHelp(): void {
    console.log(`
Available commands:
  /help              Show this help message
  /prompt            Display the current system prompt
  /switch <version>  Switch prompt (v1=Warm, v2=Casual, v3=Minimal)
  /scenario          List scenarios and switch
  /auto              Run test questions for current scenario
  /reset             Clear conversation history
  /history           Show conversation history
  /quit              Exit the tester
`);
  }

  private async sendMessage(userMessage: string): Promise<string> {
    this.conversationHistory.push({ role: "user", content: userMessage });

    try {
      process.stdout.write("\n🤖 ");

      const stream = await anthropic.messages.stream({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: this.getSystemPrompt(),
        messages: this.conversationHistory,
      });

      let fullResponse = "";

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          process.stdout.write(event.delta.text);
          fullResponse += event.delta.text;
        }
      }

      console.log("\n");

      this.conversationHistory.push({ role: "assistant", content: fullResponse });
      return fullResponse;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`\n❌ API Error: ${message}\n`);
      // Remove the user message we just added since it failed
      this.conversationHistory.pop();
      return "";
    }
  }

  private async handleCommand(input: string): Promise<boolean> {
    const parts = input.trim().split(/\s+/);
    const command = parts[0].toLowerCase();
    const arg = parts[1];

    switch (command) {
      case "/help":
        this.printHelp();
        return true;

      case "/quit":
      case "/exit":
        console.log("\n👋 Goodbye!\n");
        this.rl.close();
        process.exit(0);

      case "/prompt":
        console.log("\n--- Current System Prompt ---\n");
        console.log(this.getSystemPrompt());
        console.log("\n--- End Prompt ---\n");
        return true;

      case "/switch":
        if (arg && arg in promptVersions) {
          this.currentPromptVersion = arg as keyof typeof promptVersions;
          this.conversationHistory = [];
          console.log(`\n✅ Switched to ${promptVersions[this.currentPromptVersion].name}`);
          console.log("   Conversation history cleared.\n");
        } else {
          console.log("\nAvailable versions:");
          for (const [key, value] of Object.entries(promptVersions)) {
            const active = key === this.currentPromptVersion ? " (current)" : "";
            console.log(`  ${key}: ${value.name}${active}`);
          }
          console.log("\nUsage: /switch v1\n");
        }
        return true;

      case "/scenario":
        if (arg) {
          const index = parseInt(arg) - 1;
          if (index >= 0 && index < allScenarios.length) {
            this.currentScenario = allScenarios[index];
            this.conversationHistory = [];
            console.log(`\n✅ Switched to: ${this.currentScenario.name}`);
            console.log(`   ${this.currentScenario.description}`);
            console.log("   Conversation history cleared.\n");
          } else {
            console.log("\n❌ Invalid scenario number.\n");
          }
        } else {
          console.log("\nAvailable scenarios:");
          allScenarios.forEach((s, i) => {
            const active = s === this.currentScenario ? " (current)" : "";
            console.log(`  ${i + 1}. ${s.name}${active}`);
            console.log(`     ${s.description}`);
          });
          console.log("\nUsage: /scenario 2\n");
        }
        return true;

      case "/auto":
        console.log("\n🤖 Running test questions automatically...\n");
        for (const question of this.currentScenario.testQuestions) {
          console.log(`👤 ${question}`);
          await this.sendMessage(question);
          // Small delay between messages
          await new Promise((r) => setTimeout(r, 500));
        }
        console.log("✅ Completed test questions.\n");
        return true;

      case "/reset":
        this.conversationHistory = [];
        console.log("\n✅ Conversation history cleared.\n");
        return true;

      case "/history":
        if (this.conversationHistory.length === 0) {
          console.log("\n📝 No conversation history yet.\n");
        } else {
          console.log("\n--- Conversation History ---\n");
          for (const msg of this.conversationHistory) {
            const prefix = msg.role === "user" ? "👤" : "🤖";
            console.log(`${prefix} ${msg.content}\n`);
          }
          console.log("--- End History ---\n");
        }
        return true;

      default:
        return false;
    }
  }

  private prompt(): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question("👤 ", (answer) => {
        resolve(answer);
      });
    });
  }

  async run(): Promise<void> {
    this.printHeader();

    while (true) {
      const input = await this.prompt();

      if (!input.trim()) {
        continue;
      }

      if (input.startsWith("/")) {
        const handled = await this.handleCommand(input);
        if (!handled) {
          console.log(`\n❌ Unknown command: ${input.split(" ")[0]}`);
          console.log("   Type /help for available commands.\n");
        }
        continue;
      }

      await this.sendMessage(input);
    }
  }
}

// Main
const tester = new PromptTester();
tester.run().catch(console.error);
