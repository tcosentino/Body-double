#!/usr/bin/env node
/**
 * Database Setup Script
 *
 * Run with: npm run db:setup
 */

import { initializeDb, closeDb, DB_PATH } from "./index.js";
import * as fs from "fs";
import * as path from "path";

console.log("Setting up Body Double database...\n");

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log(`Created data directory: ${dataDir}`);
}

// Initialize database with schema
initializeDb();

console.log("\nDatabase setup complete!");
console.log(`Location: ${DB_PATH}`);

closeDb();
