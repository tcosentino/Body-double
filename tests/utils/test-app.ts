/**
 * Test App
 *
 * Creates an Express app instance for integration testing.
 */

import express from "express";
import cors from "cors";
import authRouter from "../../src/server/routes/auth.js";
import usersRouter from "../../src/server/routes/users.js";
import sessionsRouter from "../../src/server/routes/sessions.js";
import chatRouter from "../../src/server/routes/chat.js";
import memoryRouter from "../../src/server/routes/memory.js";

export function createTestApp() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // API Routes
  app.use("/api/auth", authRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/sessions", sessionsRouter);
  app.use("/api/chat", chatRouter);
  app.use("/api/memory", memoryRouter);

  // Error handling
  app.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error("Test server error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  );

  return app;
}
