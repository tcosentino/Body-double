/**
 * Body Double API Server
 *
 * Express server with WebSocket support for real-time chat.
 */

import express from "express";
import cors from "cors";
import { createServer } from "http";
import { initializeDb, closeDb } from "./db/index.js";
import { setupWebSocket } from "./websocket.js";
import usersRouter from "./routes/users.js";
import sessionsRouter from "./routes/sessions.js";
import chatRouter from "./routes/chat.js";

const PORT = process.env.PORT || 3001;

// Initialize Express
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API Routes
app.use("/api/users", usersRouter);
app.use("/api/sessions", sessionsRouter);
app.use("/api/chat", chatRouter);

// Error handling
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Server error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Create HTTP server
const server = createServer(app);

// Setup WebSocket
const wss = setupWebSocket(server);

// Initialize database
initializeDb();

// Start server
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                    Body Double API                         ║
╠════════════════════════════════════════════════════════════╣
║  HTTP:      http://localhost:${PORT}                          ║
║  WebSocket: ws://localhost:${PORT}/ws                         ║
║  Health:    http://localhost:${PORT}/health                   ║
╚════════════════════════════════════════════════════════════╝

API Endpoints:
  POST   /api/users              Create user
  GET    /api/users/:id          Get user
  GET    /api/users/:id/context  Get user context for AI
  PUT    /api/users/:id/context  Update user context

  POST   /api/sessions/start     Start focus session
  POST   /api/sessions/:id/end   End session with reflection
  GET    /api/sessions/:id       Get session
  GET    /api/sessions/user/:userId/history  Session history

  POST   /api/chat               Send message (non-streaming)

WebSocket:
  Connect to /ws and send:
    { "type": "join", "sessionId": "..." }
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
