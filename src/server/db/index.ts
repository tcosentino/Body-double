/**
 * Database Connection
 *
 * Manages SQLite database connection and provides query helpers.
 */

import Database from "better-sqlite3";
import { schema } from "./schema.js";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, "../../../data/body-double.db");

let db: Database.Database | null = null;
let testDb: Database.Database | null = null;

export function getDb(): Database.Database {
  // If test database is set, use it
  if (testDb) {
    return testDb;
  }

  if (!db) {
    // Ensure data directory exists
    const dataDir = path.dirname(DB_PATH);
    import("fs").then((fs) => {
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
    });

    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
  }
  return db;
}

export function initializeDb(): void {
  const database = getDb();
  database.exec(schema);
  console.log(`Database initialized at ${DB_PATH}`);
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Set a test database instance (for testing purposes only)
 */
export function setTestDb(database: Database.Database | null): void {
  testDb = database;
}

export { DB_PATH };
