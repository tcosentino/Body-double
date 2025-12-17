/**
 * Memory Routes Integration Tests
 */

import { describe, it, expect } from "vitest";
import request from "supertest";
import { createTestApp } from "../utils/test-app.js";
import { createAuthenticatedUser, createTestContextItem } from "../utils/test-helpers.js";
import { getTestDb } from "../utils/test-db.js";

const app = createTestApp();

describe("Memory Routes", () => {
  describe("GET /api/memory", () => {
    it("should return empty array when user has no memories", async () => {
      const { token } = createAuthenticatedUser();

      const response = await request(app)
        .get("/api/memory")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it("should return all memories for the user", async () => {
      const { user, token } = createAuthenticatedUser();
      createTestContextItem(user.id, "project", "Working on Body Double app");
      createTestContextItem(user.id, "interest", "TypeScript development");

      const response = await request(app)
        .get("/api/memory")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.length).toBe(2);
    });

    it("should filter memories by category", async () => {
      const { user, token } = createAuthenticatedUser();
      createTestContextItem(user.id, "project", "Project 1");
      createTestContextItem(user.id, "interest", "Interest 1");

      const response = await request(app)
        .get("/api/memory?category=project")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.length).toBe(1);
      expect(response.body[0].category).toBe("project");
    });

    it("should reject invalid category", async () => {
      const { token } = createAuthenticatedUser();

      const response = await request(app)
        .get("/api/memory?category=invalid")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Invalid category");
    });

    it("should search memories by content", async () => {
      const { user, token } = createAuthenticatedUser();
      createTestContextItem(user.id, "project", "Working on TypeScript");
      createTestContextItem(user.id, "interest", "Python development");

      const response = await request(app)
        .get("/api/memory?search=TypeScript")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.length).toBe(1);
      expect(response.body[0].content).toContain("TypeScript");
    });

    it("should require authentication", async () => {
      const response = await request(app).get("/api/memory");

      expect(response.status).toBe(401);
    });
  });

  describe("GET /api/memory/:id", () => {
    it("should return a specific memory", async () => {
      const { user, token } = createAuthenticatedUser();
      createTestContextItem(user.id, "project", "Test project");

      const db = getTestDb();
      const memory = db
        .prepare(`SELECT * FROM user_context_items WHERE user_id = ?`)
        .get(user.id) as { id: string };

      const response = await request(app)
        .get(`/api/memory/${memory.id}`)
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.content).toBe("Test project");
    });

    it("should return 404 for non-existent memory", async () => {
      const { token } = createAuthenticatedUser();

      const response = await request(app)
        .get("/api/memory/non-existent-id")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(404);
    });

    it("should not return another user's memory", async () => {
      const { user: user1 } = createAuthenticatedUser();
      const { token: token2 } = createAuthenticatedUser();
      createTestContextItem(user1.id, "project", "User 1 project");

      const db = getTestDb();
      const memory = db
        .prepare(`SELECT * FROM user_context_items WHERE user_id = ?`)
        .get(user1.id) as { id: string };

      const response = await request(app)
        .get(`/api/memory/${memory.id}`)
        .set("Authorization", `Bearer ${token2}`);

      expect(response.status).toBe(404);
    });
  });

  describe("POST /api/memory", () => {
    it("should create a new memory", async () => {
      const { token } = createAuthenticatedUser();

      const response = await request(app)
        .post("/api/memory")
        .set("Authorization", `Bearer ${token}`)
        .send({
          category: "project",
          content: "New project memory",
          importance: 3,
        });

      expect(response.status).toBe(201);
      expect(response.body.category).toBe("project");
      expect(response.body.content).toBe("New project memory");
      expect(response.body.importance).toBe(3);
      expect(response.body.id).toBeDefined();
    });

    it("should require category and content", async () => {
      const { token } = createAuthenticatedUser();

      const response = await request(app)
        .post("/api/memory")
        .set("Authorization", `Bearer ${token}`)
        .send({ category: "project" });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("required");
    });

    it("should reject invalid category", async () => {
      const { token } = createAuthenticatedUser();

      const response = await request(app)
        .post("/api/memory")
        .set("Authorization", `Bearer ${token}`)
        .send({
          category: "invalid",
          content: "Test",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Invalid category");
    });

    it("should reject importance outside 1-5 range", async () => {
      const { token } = createAuthenticatedUser();

      const response = await request(app)
        .post("/api/memory")
        .set("Authorization", `Bearer ${token}`)
        .send({
          category: "project",
          content: "Test",
          importance: 10,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("importance");
    });

    it("should accept valid source field", async () => {
      const { token } = createAuthenticatedUser();

      const response = await request(app)
        .post("/api/memory")
        .set("Authorization", `Bearer ${token}`)
        .send({
          category: "insight",
          content: "User mentioned they work best in morning",
          source: "conversation",
        });

      expect(response.status).toBe(201);
      expect(response.body.source).toBe("conversation");
    });
  });

  describe("PUT /api/memory/:id", () => {
    it("should update a memory", async () => {
      const { user, token } = createAuthenticatedUser();
      createTestContextItem(user.id, "project", "Original content");

      const db = getTestDb();
      const memory = db
        .prepare(`SELECT * FROM user_context_items WHERE user_id = ?`)
        .get(user.id) as { id: string };

      const response = await request(app)
        .put(`/api/memory/${memory.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ content: "Updated content" });

      expect(response.status).toBe(200);
      expect(response.body.content).toBe("Updated content");
    });

    it("should update importance", async () => {
      const { user, token } = createAuthenticatedUser();
      createTestContextItem(user.id, "project", "Test", 2);

      const db = getTestDb();
      const memory = db
        .prepare(`SELECT * FROM user_context_items WHERE user_id = ?`)
        .get(user.id) as { id: string };

      const response = await request(app)
        .put(`/api/memory/${memory.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ importance: 5 });

      expect(response.status).toBe(200);
      expect(response.body.importance).toBe(5);
    });

    it("should update category", async () => {
      const { user, token } = createAuthenticatedUser();
      createTestContextItem(user.id, "project", "Test");

      const db = getTestDb();
      const memory = db
        .prepare(`SELECT * FROM user_context_items WHERE user_id = ?`)
        .get(user.id) as { id: string };

      const response = await request(app)
        .put(`/api/memory/${memory.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ category: "interest" });

      expect(response.status).toBe(200);
      expect(response.body.category).toBe("interest");
    });

    it("should return 404 for non-existent memory", async () => {
      const { token } = createAuthenticatedUser();

      const response = await request(app)
        .put("/api/memory/non-existent-id")
        .set("Authorization", `Bearer ${token}`)
        .send({ content: "Updated" });

      expect(response.status).toBe(404);
    });

    it("should reject invalid category in update", async () => {
      const { user, token } = createAuthenticatedUser();
      createTestContextItem(user.id, "project", "Test");

      const db = getTestDb();
      const memory = db
        .prepare(`SELECT * FROM user_context_items WHERE user_id = ?`)
        .get(user.id) as { id: string };

      const response = await request(app)
        .put(`/api/memory/${memory.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ category: "invalid" });

      expect(response.status).toBe(400);
    });
  });

  describe("DELETE /api/memory/:id", () => {
    it("should delete a memory", async () => {
      const { user, token } = createAuthenticatedUser();
      createTestContextItem(user.id, "project", "To be deleted");

      const db = getTestDb();
      const memory = db
        .prepare(`SELECT * FROM user_context_items WHERE user_id = ?`)
        .get(user.id) as { id: string };

      const response = await request(app)
        .delete(`/api/memory/${memory.id}`)
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify deletion
      const deleted = db
        .prepare(`SELECT * FROM user_context_items WHERE id = ?`)
        .get(memory.id);
      expect(deleted).toBeUndefined();
    });

    it("should return 404 for non-existent memory", async () => {
      const { token } = createAuthenticatedUser();

      const response = await request(app)
        .delete("/api/memory/non-existent-id")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(404);
    });

    it("should not delete another user's memory", async () => {
      const { user: user1 } = createAuthenticatedUser();
      const { token: token2 } = createAuthenticatedUser();
      createTestContextItem(user1.id, "project", "User 1 memory");

      const db = getTestDb();
      const memory = db
        .prepare(`SELECT * FROM user_context_items WHERE user_id = ?`)
        .get(user1.id) as { id: string };

      const response = await request(app)
        .delete(`/api/memory/${memory.id}`)
        .set("Authorization", `Bearer ${token2}`);

      expect(response.status).toBe(404);
    });
  });

  describe("POST /api/memory/bulk", () => {
    it("should create multiple memories at once", async () => {
      const { token } = createAuthenticatedUser();

      const response = await request(app)
        .post("/api/memory/bulk")
        .set("Authorization", `Bearer ${token}`)
        .send({
          memories: [
            { category: "project", content: "Project 1" },
            { category: "interest", content: "Interest 1" },
            { category: "goal", content: "Goal 1", importance: 5 },
          ],
        });

      expect(response.status).toBe(201);
      expect(response.body.length).toBe(3);
      expect(response.body[0].category).toBe("project");
      expect(response.body[2].importance).toBe(5);
    });

    it("should require memories array", async () => {
      const { token } = createAuthenticatedUser();

      const response = await request(app)
        .post("/api/memory/bulk")
        .set("Authorization", `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("memories array");
    });

    it("should reject empty array", async () => {
      const { token } = createAuthenticatedUser();

      const response = await request(app)
        .post("/api/memory/bulk")
        .set("Authorization", `Bearer ${token}`)
        .send({ memories: [] });

      expect(response.status).toBe(400);
    });

    it("should validate each memory in bulk", async () => {
      const { token } = createAuthenticatedUser();

      const response = await request(app)
        .post("/api/memory/bulk")
        .set("Authorization", `Bearer ${token}`)
        .send({
          memories: [
            { category: "project", content: "Valid" },
            { category: "invalid", content: "Invalid category" },
          ],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Invalid category");
    });

    it("should require category and content for each memory", async () => {
      const { token } = createAuthenticatedUser();

      const response = await request(app)
        .post("/api/memory/bulk")
        .set("Authorization", `Bearer ${token}`)
        .send({
          memories: [{ category: "project" }], // Missing content
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("requires category and content");
    });
  });

  describe("GET /api/memory/summary", () => {
    it("should return memory summary by category", async () => {
      const { user, token } = createAuthenticatedUser();
      createTestContextItem(user.id, "project", "Project 1");
      createTestContextItem(user.id, "project", "Project 2");
      createTestContextItem(user.id, "interest", "Interest 1");

      const response = await request(app)
        .get("/api/memory/summary")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      // Summary uses plural keys: projects, interests, etc.
      expect(response.body.projects).toBeDefined();
      expect(response.body.projects.length).toBe(2);
      expect(response.body.interests.length).toBe(1);
    });

    it("should return empty arrays when no memories", async () => {
      const { token } = createAuthenticatedUser();

      const response = await request(app)
        .get("/api/memory/summary")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      // Returns empty arrays for each category
      expect(response.body.projects).toEqual([]);
      expect(response.body.goals).toEqual([]);
    });
  });

  describe("GET /api/memory/stats", () => {
    it("should return memory statistics", async () => {
      const { user, token } = createAuthenticatedUser();
      createTestContextItem(user.id, "project", "Project 1", 3);
      createTestContextItem(user.id, "interest", "Interest 1", 5);

      const response = await request(app)
        .get("/api/memory/stats")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(2);
      expect(response.body.byCategory).toBeDefined();
      expect(response.body.byCategory.project).toBe(1);
      expect(response.body.byCategory.interest).toBe(1);
    });

    it("should return zero stats when no memories", async () => {
      const { token } = createAuthenticatedUser();

      const response = await request(app)
        .get("/api/memory/stats")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(0);
    });
  });

  describe("GET /api/memory/categories", () => {
    it("should return all valid categories with descriptions", async () => {
      const { token } = createAuthenticatedUser();

      const response = await request(app)
        .get("/api/memory/categories")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.categories).toBeDefined();
      expect(Array.isArray(response.body.categories)).toBe(true);
      expect(response.body.categories).toContain("project");
      expect(response.body.categories).toContain("interest");
      expect(response.body.categories).toContain("goal");
      expect(response.body.descriptions).toBeDefined();
      expect(response.body.descriptions.project).toBeDefined();
    });
  });
});
