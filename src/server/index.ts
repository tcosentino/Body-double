/**
 * Body Double API Server
 *
 * Express server with WebSocket support for real-time chat.
 */

import express from "express";
import cors from "cors";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { initializeDb, closeDb } from "./db/index.js";
import { setupWebSocket } from "./websocket.js";
import authRouter from "./routes/auth.js";
import usersRouter from "./routes/users.js";
import sessionsRouter from "./routes/sessions.js";
import chatRouter from "./routes/chat.js";
import memoryRouter from "./routes/memory.js";
import { cleanupExpiredAuth } from "./services/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

// Initialize Express
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, "../../public")));

// Request logging (skip static files)
app.use((req, _res, next) => {
  if (!req.path.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2)$/)) {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  }
  next();
});

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API Routes
app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/sessions", sessionsRouter);
app.use("/api/chat", chatRouter);
app.use("/api/memory", memoryRouter);

// Error handling
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Server error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// Serve index.html for non-API routes (SPA fallback)
app.get("*", (req, res) => {
  // Only serve index.html for non-API routes
  if (!req.path.startsWith("/api/")) {
    res.sendFile(path.join(__dirname, "../../public/index.html"));
  } else {
    res.status(404).json({ error: "Not found" });
  }
});

// Create HTTP server
const server = createServer(app);

// Setup WebSocket
const wss = setupWebSocket(server);

// Initialize database
initializeDb();

// Periodic cleanup of expired auth tokens (every hour)
setInterval(
  () => {
    const cleaned = cleanupExpiredAuth();
    if (cleaned.magicLinks > 0 || cleaned.sessions > 0) {
      console.log(
        `Auth cleanup: removed ${cleaned.magicLinks} magic links, ${cleaned.sessions} sessions`
      );
    }
  },
  60 * 60 * 1000
);

// Start server
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                    Body Double                             ║
║              AI-Powered Focus Companion                    ║
╠════════════════════════════════════════════════════════════╣
║  Website:   http://localhost:${PORT}                          ║
║  API:       http://localhost:${PORT}/api                      ║
║  WebSocket: ws://localhost:${PORT}/ws                         ║
║  Health:    http://localhost:${PORT}/health                   ║
╚════════════════════════════════════════════════════════════╝

Marketing Site:
  /                             Landing page
  /auth/login                   Login page (TODO)
  /auth/signup                  Signup page (TODO)

Auth Endpoints:
  POST   /api/auth/request       Request magic link (email)
  POST   /api/auth/verify        Verify magic link token
  GET    /api/auth/me            Get current user (auth required)
  POST   /api/auth/logout        Logout (auth required)

API Endpoints (auth required):
  GET    /api/users/me           Get current user profile
  PUT    /api/users/me/context   Update user context
  GET    /api/users/me/context   Get user context for AI

  POST   /api/sessions/start     Start focus session
  POST   /api/sessions/:id/end   End session with reflection
  GET    /api/sessions/:id       Get session
  GET    /api/sessions/history   Session history

  POST   /api/chat               Send message (non-streaming)

Memory Endpoints (auth required):
  GET    /api/memory             List all memories
  GET    /api/memory/summary     Get memory summary for AI
  GET    /api/memory/stats       Get memory statistics
  GET    /api/memory/categories  Get valid categories
  POST   /api/memory             Create a memory
  PUT    /api/memory/:id         Update a memory
  DELETE /api/memory/:id         Delete a memory
  POST   /api/memory/bulk        Create multiple memories

WebSocket:
  Connect to /ws with token query param: /ws?token=xxx
  Send: { "type": "join", "sessionId": "..." }
        { "type": "message", "content": "..." }
        { "type": "leave" }
  `);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  wss.close();
  server.close();
  closeDb();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\nShutting down...");
  wss.close();
  server.close();
  closeDb();
  process.exit(0);
});
