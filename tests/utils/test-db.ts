/**
 * Test Database Utilities
 *
 * Creates an in-memory SQLite database for testing.
 */

import Database from "better-sqlite3";
import { schema } from "../../src/server/db/schema.js";
import { setTestDb } from "../../src/server/db/index.js";

let testDb: Database.Database | null = null;

export async function setupTestDb(): Promise<void> {
  // Create in-memory database
  testDb = new Database(":memory:");
  testDb.pragma("foreign_keys = ON");
  testDb.exec(schema);

  // Set the test database in the db module
  setTestDb(testDb);
}

export async function teardownTestDb(): Promise<void> {
  // Clear the test database reference in db module
  setTestDb(null);

  if (testDb) {
    testDb.close();
    testDb = null;
  }
}

export async function resetTestDb(): Promise<void> {
  if (!testDb) return;

  // Clear all tables in reverse dependency order
  const tables = [
    "messages",
    "user_context_items",
    "sessions",
    "auth_sessions",
    "magic_links",
    "users",
  ];

  for (const table of tables) {
    testDb.exec(`DELETE FROM ${table}`);
  }
}

export function getTestDb(): Database.Database {
  if (!testDb) {
    throw new Error("Test database not initialized. Call setupTestDb first.");
  }
  return testDb;
}
