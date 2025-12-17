/**
 * User Routes Integration Tests
 */

import { describe, it, expect } from "vitest";
import request from "supertest";
import { createTestApp } from "../utils/test-app.js";
import { createAuthenticatedUser, createTestContextItem } from "../utils/test-helpers.js";

const app = createTestApp();

describe("User Routes", () => {
  describe("GET /api/users/me", () => {
    it("should return current user profile", async () => {
      const { user, token } = createAuthenticatedUser({
        name: "Profile Test",
        work_context: "Test work context",
        interests: JSON.stringify(["coding", "testing"]),
      });

      const response = await request(app)
        .get("/api/users/me")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(user.id);
      expect(response.body.name).toBe("Profile Test");
      expect(response.body.work_context).toBe("Test work context");
      expect(response.body.interests).toEqual(["coding", "testing"]);
    });

    it("should return 401 when not authenticated", async () => {
      const response = await request(app).get("/api/users/me");

      expect(response.status).toBe(401);
    });
  });

  describe("PUT /api/users/me", () => {
    it("should update user name", async () => {
      const { token } = createAuthenticatedUser({ name: "Old Name" });

      const response = await request(app)
        .put("/api/users/me")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "New Name" });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe("New Name");
    });
  });

  describe("GET /api/users/me/context", () => {
    it("should return user context for AI companion", async () => {
      const { user, token } = createAuthenticatedUser({
        name: "Context User",
        work_context: "Software developer",
      });

      createTestContextItem(user.id, "project", "API development");
      createTestContextItem(user.id, "challenge", "Focus issues");

      const response = await request(app)
        .get("/api/users/me/context")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.user.name).toBe("Context User");
      expect(response.body.user.workContext).toBe("Software developer");
      expect(response.body.memories.projects).toContain("API development");
      expect(response.body.memories.challenges).toContain("Focus issues");
    });
  });

  describe("PUT /api/users/me/context", () => {
    it("should update user work context", async () => {
      const { token } = createAuthenticatedUser();

      const response = await request(app)
        .put("/api/users/me/context")
        .set("Authorization", `Bearer ${token}`)
        .send({ workContext: "Senior engineer at startup" });

      expect(response.status).toBe(200);
      expect(response.body.work_context).toBe("Senior engineer at startup");
    });

    it("should update user interests", async () => {
      const { token } = createAuthenticatedUser();

      const response = await request(app)
        .put("/api/users/me/context")
        .set("Authorization", `Bearer ${token}`)
        .send({ interests: ["rust", "climbing", "coffee"] });

      expect(response.status).toBe(200);
      expect(response.body.interests).toEqual(["rust", "climbing", "coffee"]);
    });

    it("should return 400 when no updates provided", async () => {
      const { token } = createAuthenticatedUser();

      const response = await request(app)
        .put("/api/users/me/context")
        .set("Authorization", `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("No updates provided");
    });
  });

  describe("PUT /api/users/me/preferences", () => {
    it("should update user preferences", async () => {
      const { token } = createAuthenticatedUser();

      const response = await request(app)
        .put("/api/users/me/preferences")
        .set("Authorization", `Bearer ${token}`)
        .send({
          defaultSessionDuration: 45,
          theme: "dark",
        });

      expect(response.status).toBe(200);
      expect(response.body.defaultSessionDuration).toBe(45);
      expect(response.body.theme).toBe("dark");
    });

    it("should merge with existing preferences", async () => {
      const { token } = createAuthenticatedUser();

      // Set initial preferences
      await request(app)
        .put("/api/users/me/preferences")
        .set("Authorization", `Bearer ${token}`)
        .send({ theme: "light" });

      // Update with new preference
      const response = await request(app)
        .put("/api/users/me/preferences")
        .set("Authorization", `Bearer ${token}`)
        .send({ defaultSessionDuration: 30 });

      expect(response.status).toBe(200);
      expect(response.body.theme).toBe("light"); // Should still be there
      expect(response.body.defaultSessionDuration).toBe(30);
    });
  });
});
