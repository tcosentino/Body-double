/**
 * Test Setup
 *
 * Global setup for all tests. Runs before each test file.
 */

import { beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "./utils/test-db.js";

// Set test environment
process.env.NODE_ENV = "test";

beforeAll(async () => {
  await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});
