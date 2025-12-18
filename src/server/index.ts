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
import notionRouter from "./routes/notion.js";
import chatsRouter from "./routes/chats.js";
import googleRouter from "./routes/google.js";
import { cleanupExpiredAuth } from "./services/auth.js";
import { startScheduler, stopScheduler } from "./services/scheduler.js";
import briefingRouter from "./routes/briefing.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

// Initialize Express
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from public directory
// extensions option allows /auth/login to serve /auth/login.html
app.use(express.static(path.join(__dirname, "../../public"), { extensions: ["html"] }));

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
app.use("/api/notion", notionRouter);
app.use("/api/chats", chatsRouter);
app.use("/api/google", googleRouter);
app.use("/api/briefing", briefingRouter);

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

// Start background scheduler
startScheduler();

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
  /auth/login                   Login page
  /auth/signup                  Signup page
  /auth/verify                  Magic link verification
  /app                          Main app (authenticated)

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

Notion Endpoints:
  GET    /api/notion/status      Check Notion connection status
  GET    /api/notion/connect     Start Notion OAuth flow
  GET    /api/notion/callback    OAuth callback (internal)
  DELETE /api/notion/disconnect  Disconnect Notion
  GET    /api/notion/databases   List available databases
  PUT    /api/notion/configure   Configure database mappings

Chat Endpoints (auth required):
  GET    /api/chats/main              Get main chat messages
  POST   /api/chats/main/messages     Add message to main chat
  DELETE /api/chats/main              Clear main chat history
  GET    /api/chats/side              List side chats
  POST   /api/chats/side              Create side chat
  POST   /api/chats/side/spawn        Spawn side chat from main
  GET    /api/chats/side/:id          Get side chat
  PATCH  /api/chats/side/:id          Update side chat
  DELETE /api/chats/side/:id          Delete side chat
  POST   /api/chats/side/:id/archive  Archive side chat
  POST   /api/chats/side/:id/pin      Toggle pin status
  GET    /api/chats/side/:id/messages Get side chat messages
  POST   /api/chats/side/:id/messages Add message to side chat
  GET    /api/chats/activity          Get recent chat activity

Google Endpoints (auth required):
  GET    /api/google/status           Check Google connection status
  GET    /api/google/connect          Start Google OAuth flow
  GET    /api/google/callback         OAuth callback (internal)
  DELETE /api/google/disconnect       Disconnect Google
  GET    /api/google/gmail/messages   List recent emails
  GET    /api/google/gmail/messages/:id  Get email by ID
  GET    /api/google/gmail/unread     Get unread email count
  GET    /api/google/calendar/events  List calendar events
  GET    /api/google/calendar/today   Get today's events
  GET    /api/google/logs             Get API call logs

Briefing & Alerts (auth required):
  GET    /api/briefing/today          Get today's briefing
  POST   /api/briefing/generate       Force generate new briefing
  GET    /api/briefing/data           Get raw briefing data
  GET    /api/briefing/history        Get recent briefings
  GET    /api/briefing/alerts         Get alerts
  GET    /api/briefing/alerts/unread  Get unread alert count
  POST   /api/briefing/alerts/:id/read     Mark alert read
  POST   /api/briefing/alerts/read-all     Mark all alerts read
  POST   /api/briefing/alerts/:id/dismiss  Dismiss alert
  POST   /api/briefing/check          Trigger background checks

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
  stopScheduler();
  wss.close();
  server.close();
  closeDb();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\nShutting down...");
  stopScheduler();
  wss.close();
  server.close();
  closeDb();
  process.exit(0);
});
