/**
 * Auth Routes Integration Tests
 */

import { describe, it, expect } from "vitest";
import request from "supertest";
import { createTestApp } from "../utils/test-app.js";
import { createTestUser, createAuthenticatedUser } from "../utils/test-helpers.js";

const app = createTestApp();

describe("Auth Routes", () => {
  describe("POST /api/auth/request", () => {
    it("should create a magic link for a new email", async () => {
      const response = await request(app)
        .post("/api/auth/request")
        .send({ email: "newuser@example.com" });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.isNewUser).toBe(true);
      expect(response.body.devToken).toBeDefined(); // Available in non-production
    });

    it("should create a magic link for an existing user", async () => {
      createTestUser({ email: "existing@example.com" });

      const response = await request(app)
        .post("/api/auth/request")
        .send({ email: "existing@example.com" });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.isNewUser).toBe(false);
    });

    it("should return 400 for missing email", async () => {
      const response = await request(app).post("/api/auth/request").send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Email is required");
    });

    it("should return 400 for invalid email format", async () => {
      const response = await request(app)
        .post("/api/auth/request")
        .send({ email: "invalid-email" });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid email format");
    });
  });

  describe("POST /api/auth/verify", () => {
    it("should verify a valid magic link token", async () => {
      // First request a magic link
      const requestRes = await request(app)
        .post("/api/auth/request")
        .send({ email: "test@example.com" });

      const token = requestRes.body.devToken;

      // Then verify it
      const verifyRes = await request(app)
        .post("/api/auth/verify")
        .send({ token, name: "Test User" });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.success).toBe(true);
      expect(verifyRes.body.user.email).toBe("test@example.com");
      expect(verifyRes.body.user.name).toBe("Test User");
      expect(verifyRes.body.token).toBeDefined();
    });

    it("should return 400 for missing token", async () => {
      const response = await request(app).post("/api/auth/verify").send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Token is required");
    });

    it("should return 401 for invalid token", async () => {
      const response = await request(app)
        .post("/api/auth/verify")
        .send({ token: "invalid-token" });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe("Invalid or expired magic link");
    });

    it("should set auth cookie", async () => {
      const requestRes = await request(app)
        .post("/api/auth/request")
        .send({ email: "cookie@example.com" });

      const verifyRes = await request(app)
        .post("/api/auth/verify")
        .send({ token: requestRes.body.devToken });

      expect(verifyRes.headers["set-cookie"]).toBeDefined();
      expect(verifyRes.headers["set-cookie"][0]).toContain("auth_token=");
    });
  });

  describe("GET /api/auth/me", () => {
    it("should return current user when authenticated", async () => {
      const { user, token } = createAuthenticatedUser({ name: "Auth Test User" });

      const response = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(user.id);
      expect(response.body.name).toBe("Auth Test User");
    });

    it("should return 401 when not authenticated", async () => {
      const response = await request(app).get("/api/auth/me");

      expect(response.status).toBe(401);
      expect(response.body.error).toBe("Authentication required");
    });

    it("should return 401 for invalid token", async () => {
      const response = await request(app)
        .get("/api/auth/me")
        .set("Authorization", "Bearer invalid-token");

      expect(response.status).toBe(401);
      expect(response.body.error).toBe("Invalid or expired session");
    });
  });

  describe("POST /api/auth/logout", () => {
    it("should logout and invalidate session", async () => {
      const { token } = createAuthenticatedUser();

      // Logout
      const logoutRes = await request(app)
        .post("/api/auth/logout")
        .set("Authorization", `Bearer ${token}`);

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.success).toBe(true);

      // Try to use the token again
      const meRes = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`);

      expect(meRes.status).toBe(401);
    });

    it("should clear auth cookie", async () => {
      const { token } = createAuthenticatedUser();

      const response = await request(app)
        .post("/api/auth/logout")
        .set("Authorization", `Bearer ${token}`);

      expect(response.headers["set-cookie"]).toBeDefined();
      expect(response.headers["set-cookie"][0]).toContain("Max-Age=0");
    });
  });
});
