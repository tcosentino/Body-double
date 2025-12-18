/**
 * Briefing Service Tests
 *
 * Tests for the briefing and alerts system including:
 * - Alert management (create, read, dismiss)
 * - Briefing generation with various data scenarios
 * - Briefing summary formatting
 * - Background check tracking
 */

import { describe, it, expect } from "vitest";
import {
  createAlert,
  getAlerts,
  getUnreadAlertCount,
  markAlertRead,
  markAllAlertsRead,
  dismissAlert,
  saveBriefing,
  getTodayBriefing,
  getRecentBriefings,
  markBriefingViewed,
  generateBriefingSummary,
  getOrCreateBackgroundCheck,
  updateBackgroundCheck,
} from "../../src/server/services/briefing.js";
import {
  createTestUser,
  createTestAlert,
  createTestBriefing,
  createTestGoogleConnection,
} from "../utils/test-helpers.js";
import { getTestDb } from "../utils/test-db.js";

describe("Briefing Service", () => {
  // ============================================
  // Alert Management Tests
  // ============================================

  describe("Alert Management", () => {
    describe("createAlert", () => {
      it("should create a basic alert", () => {
        const user = createTestUser();
        const alert = createAlert(user.id, {
          type: "email",
          title: "New email from John",
          content: "Subject: Meeting tomorrow",
        });

        expect(alert.id).toBeDefined();
        expect(alert.user_id).toBe(user.id);
        expect(alert.type).toBe("email");
        expect(alert.title).toBe("New email from John");
        expect(alert.content).toBe("Subject: Meeting tomorrow");
        expect(alert.status).toBe("unread");
        expect(alert.priority).toBe("normal");
      });

      it("should create alert with high priority", () => {
        const user = createTestUser();
        const alert = createAlert(user.id, {
          type: "calendar",
          title: "Meeting in 5 minutes",
          content: "Weekly standup",
          priority: "urgent",
        });

        expect(alert.priority).toBe("urgent");
      });

      it("should create alert with source information", () => {
        const user = createTestUser();
        const alert = createAlert(user.id, {
          type: "email",
          title: "New email",
          content: "Important message",
          source_type: "gmail",
          source_id: "msg_12345",
          action_type: "open_email",
          action_data: { emailId: "msg_12345", threadId: "thread_123" },
        });

        expect(alert.source_type).toBe("gmail");
        expect(alert.source_id).toBe("msg_12345");
        expect(alert.action_type).toBe("open_email");
        expect(JSON.parse(alert.action_data!)).toEqual({
          emailId: "msg_12345",
          threadId: "thread_123",
        });
      });

      it("should create briefing alert", () => {
        const user = createTestUser();
        const alert = createAlert(user.id, {
          type: "briefing",
          title: "Morning Briefing Ready",
          content: "You have 3 events and 5 unread emails",
          source_type: "system",
          action_type: "spawn_chat",
          action_data: { topic: "morning_briefing" },
        });

        expect(alert.type).toBe("briefing");
        expect(alert.source_type).toBe("system");
      });
    });

    describe("getAlerts", () => {
      it("should return alerts for a user", () => {
        const user = createTestUser();
        createTestAlert(user.id, { title: "Alert 1" });
        createTestAlert(user.id, { title: "Alert 2" });
        createTestAlert(user.id, { title: "Alert 3" });

        const result = getAlerts(user.id);

        expect(result.alerts).toHaveLength(3);
        expect(result.total).toBe(3);
      });

      it("should filter by status", () => {
        const user = createTestUser();
        createTestAlert(user.id, { title: "Unread 1", status: "unread" });
        createTestAlert(user.id, { title: "Unread 2", status: "unread" });
        createTestAlert(user.id, { title: "Read", status: "read" });

        const result = getAlerts(user.id, { status: "unread" });

        expect(result.alerts).toHaveLength(2);
        expect(result.total).toBe(2);
      });

      it("should filter by type", () => {
        const user = createTestUser();
        createTestAlert(user.id, { type: "email", title: "Email 1" });
        createTestAlert(user.id, { type: "email", title: "Email 2" });
        createTestAlert(user.id, { type: "calendar", title: "Calendar" });

        const result = getAlerts(user.id, { type: "email" });

        expect(result.alerts).toHaveLength(2);
      });

      it("should respect limit and offset", () => {
        const user = createTestUser();
        for (let i = 0; i < 10; i++) {
          createTestAlert(user.id, { title: `Alert ${i}` });
        }

        const result = getAlerts(user.id, { limit: 3, offset: 2 });

        expect(result.alerts).toHaveLength(3);
        expect(result.total).toBe(10);
      });

      it("should return empty for user with no alerts", () => {
        const user = createTestUser();
        const result = getAlerts(user.id);

        expect(result.alerts).toHaveLength(0);
        expect(result.total).toBe(0);
      });
    });

    describe("getUnreadAlertCount", () => {
      it("should count unread alerts", () => {
        const user = createTestUser();
        createTestAlert(user.id, { status: "unread" });
        createTestAlert(user.id, { status: "unread" });
        createTestAlert(user.id, { status: "read" });
        createTestAlert(user.id, { status: "dismissed" });

        const count = getUnreadAlertCount(user.id);

        expect(count).toBe(2);
      });

      it("should return 0 for no unread alerts", () => {
        const user = createTestUser();
        createTestAlert(user.id, { status: "read" });

        const count = getUnreadAlertCount(user.id);

        expect(count).toBe(0);
      });
    });

    describe("markAlertRead", () => {
      it("should mark alert as read", () => {
        const user = createTestUser();
        const { id: alertId } = createTestAlert(user.id, { status: "unread" });

        const success = markAlertRead(user.id, alertId);

        expect(success).toBe(true);

        const db = getTestDb();
        const alert = db
          .prepare(`SELECT status, read_at FROM alerts WHERE id = ?`)
          .get(alertId) as {
          status: string;
          read_at: string;
        };
        expect(alert.status).toBe("read");
        expect(alert.read_at).toBeDefined();
      });

      it("should return false for non-existent alert", () => {
        const user = createTestUser();
        const success = markAlertRead(user.id, "non-existent");

        expect(success).toBe(false);
      });

      it("should not update other users alerts", () => {
        const user1 = createTestUser();
        const user2 = createTestUser();
        const { id: alertId } = createTestAlert(user1.id);

        const success = markAlertRead(user2.id, alertId);

        expect(success).toBe(false);
      });
    });

    describe("markAllAlertsRead", () => {
      it("should mark all unread alerts as read", () => {
        const user = createTestUser();
        createTestAlert(user.id, { status: "unread" });
        createTestAlert(user.id, { status: "unread" });
        createTestAlert(user.id, { status: "read" });

        const count = markAllAlertsRead(user.id);

        expect(count).toBe(2);
        expect(getUnreadAlertCount(user.id)).toBe(0);
      });

      it("should return 0 if no unread alerts", () => {
        const user = createTestUser();
        createTestAlert(user.id, { status: "read" });

        const count = markAllAlertsRead(user.id);

        expect(count).toBe(0);
      });
    });

    describe("dismissAlert", () => {
      it("should dismiss an alert", () => {
        const user = createTestUser();
        const { id: alertId } = createTestAlert(user.id);

        const success = dismissAlert(user.id, alertId);

        expect(success).toBe(true);

        const db = getTestDb();
        const alert = db
          .prepare(`SELECT status, dismissed_at FROM alerts WHERE id = ?`)
          .get(alertId) as {
          status: string;
          dismissed_at: string;
        };
        expect(alert.status).toBe("dismissed");
        expect(alert.dismissed_at).toBeDefined();
      });
    });
  });

  // ============================================
  // Briefing Tests
  // ============================================

  describe("Briefing Management", () => {
    describe("saveBriefing", () => {
      it("should save a new briefing", () => {
        const user = createTestUser();
        const today = new Date().toISOString().split("T")[0];

        const briefing = saveBriefing(user.id, {
          date: today,
          type: "morning",
          summary: "Good morning! You have 3 meetings today.",
          calendar_events: [
            { id: "1", summary: "Standup", start: "9:00", end: "9:30" },
            { id: "2", summary: "1:1 with Manager", start: "14:00", end: "14:30" },
            { id: "3", summary: "Team Retro", start: "16:00", end: "17:00" },
          ],
          emails: [
            {
              id: "e1",
              from: "boss@company.com",
              subject: "Q4 Goals",
              snippet: "Let's discuss...",
            },
          ],
          tasks: [],
        });

        expect(briefing.id).toBeDefined();
        expect(briefing.date).toBe(today);
        expect(briefing.type).toBe("morning");
        expect(briefing.summary).toContain("Good morning");
        expect(JSON.parse(briefing.calendar_events!)).toHaveLength(3);
        expect(JSON.parse(briefing.emails!)).toHaveLength(1);
      });

      it("should replace existing briefing for same date/type", () => {
        const user = createTestUser();
        const today = new Date().toISOString().split("T")[0];

        const first = saveBriefing(user.id, {
          date: today,
          type: "morning",
          summary: "First summary",
        });

        const second = saveBriefing(user.id, {
          date: today,
          type: "morning",
          summary: "Updated summary",
        });

        // Should be different IDs but same date
        expect(first.id).not.toBe(second.id);

        // Only one briefing should exist for this date
        const db = getTestDb();
        const count = db
          .prepare(`SELECT COUNT(*) as count FROM briefings WHERE user_id = ? AND date = ?`)
          .get(user.id, today) as { count: number };
        expect(count.count).toBe(1);
      });
    });

    describe("getTodayBriefing", () => {
      it("should return todays briefing", () => {
        const user = createTestUser();
        const today = new Date().toISOString().split("T")[0];

        createTestBriefing(user.id, {
          date: today,
          summary: "Today's briefing",
        });

        const briefing = getTodayBriefing(user.id, "morning");

        expect(briefing).not.toBeNull();
        expect(briefing!.summary).toBe("Today's briefing");
      });

      it("should return null if no briefing exists", () => {
        const user = createTestUser();
        const briefing = getTodayBriefing(user.id, "morning");

        expect(briefing).toBeNull();
      });

      it("should not return yesterdays briefing", () => {
        const user = createTestUser();
        const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

        createTestBriefing(user.id, {
          date: yesterday,
          summary: "Yesterday's briefing",
        });

        const briefing = getTodayBriefing(user.id, "morning");

        expect(briefing).toBeNull();
      });
    });

    describe("getRecentBriefings", () => {
      it("should return recent briefings in order", () => {
        const user = createTestUser();
        const today = new Date();

        for (let i = 0; i < 5; i++) {
          const date = new Date(today);
          date.setDate(date.getDate() - i);
          createTestBriefing(user.id, {
            date: date.toISOString().split("T")[0],
            summary: `Day ${i} briefing`,
          });
        }

        const briefings = getRecentBriefings(user.id, 3);

        expect(briefings).toHaveLength(3);
        // Should be ordered by date DESC
        expect(briefings[0].summary).toBe("Day 0 briefing");
      });
    });

    describe("markBriefingViewed", () => {
      it("should mark briefing as viewed", () => {
        const user = createTestUser();
        const { id: briefingId } = createTestBriefing(user.id);

        const success = markBriefingViewed(user.id, briefingId);

        expect(success).toBe(true);

        const db = getTestDb();
        const briefing = db
          .prepare(`SELECT viewed_at FROM briefings WHERE id = ?`)
          .get(briefingId) as {
          viewed_at: string;
        };
        expect(briefing.viewed_at).toBeDefined();
      });
    });
  });

  // ============================================
  // Briefing Summary Generation Tests
  // ============================================

  describe("generateBriefingSummary", () => {
    it("should generate summary with calendar events", () => {
      const summary = generateBriefingSummary({
        calendarEvents: [
          {
            id: "1",
            summary: "Team Standup",
            start: "2024-01-15T09:00:00",
            end: "2024-01-15T09:30:00",
          },
          {
            id: "2",
            summary: "Client Call",
            start: "2024-01-15T14:00:00",
            end: "2024-01-15T15:00:00",
          },
        ],
        emails: [],
        unreadCount: 0,
        tasks: [],
        hasGoogle: true,
        hasNotion: false,
      });

      expect(summary).toContain("Today's Schedule");
      expect(summary).toContain("2 events");
      expect(summary).toContain("Team Standup");
      expect(summary).toContain("Client Call");
    });

    it("should generate summary with unread emails", () => {
      const summary = generateBriefingSummary({
        calendarEvents: [],
        emails: [
          {
            id: "1",
            from: "John Doe <john@example.com>",
            subject: "Project Update",
            snippet: "Here is...",
            date: "",
          },
          {
            id: "2",
            from: "Jane Smith <jane@example.com>",
            subject: "Meeting Notes",
            snippet: "From...",
            date: "",
          },
        ],
        unreadCount: 5,
        tasks: [],
        hasGoogle: true,
        hasNotion: false,
      });

      expect(summary).toContain("Email");
      expect(summary).toContain("5 unread");
      expect(summary).toContain("John Doe");
      expect(summary).toContain("Project Update");
    });

    it("should handle empty day (no events or emails)", () => {
      const summary = generateBriefingSummary({
        calendarEvents: [],
        emails: [],
        unreadCount: 0,
        tasks: [],
        hasGoogle: true,
        hasNotion: false,
      });

      expect(summary).toContain("No events scheduled");
      expect(summary).toContain("All caught up");
    });

    it("should suggest connecting integrations when none connected", () => {
      const summary = generateBriefingSummary({
        calendarEvents: [],
        emails: [],
        unreadCount: 0,
        tasks: [],
        hasGoogle: false,
        hasNotion: false,
      });

      expect(summary).toContain("Connect Google or Notion");
    });

    it("should handle busy day with many events", () => {
      const events = [];
      for (let i = 0; i < 8; i++) {
        events.push({
          id: `${i}`,
          summary: `Meeting ${i + 1}`,
          start: `2024-01-15T${9 + i}:00:00`,
          end: `2024-01-15T${10 + i}:00:00`,
        });
      }

      const summary = generateBriefingSummary({
        calendarEvents: events,
        emails: [],
        unreadCount: 0,
        tasks: [],
        hasGoogle: true,
        hasNotion: false,
      });

      expect(summary).toContain("8 events");
      expect(summary).toContain("...and 3 more events");
    });

    it("should include tasks when available", () => {
      const summary = generateBriefingSummary({
        calendarEvents: [],
        emails: [],
        unreadCount: 0,
        tasks: [
          { id: "1", title: "Review PR #123", status: "in_progress" },
          { id: "2", title: "Write documentation", status: "todo" },
        ],
        hasGoogle: false,
        hasNotion: true,
      });

      expect(summary).toContain("Tasks");
      expect(summary).toContain("2 items");
      expect(summary).toContain("Review PR #123");
    });
  });

  // ============================================
  // Background Check Tracking Tests
  // ============================================

  describe("Background Check Tracking", () => {
    describe("getOrCreateBackgroundCheck", () => {
      it("should create new background check record", () => {
        const user = createTestUser();

        const check = getOrCreateBackgroundCheck(user.id, "email");

        expect(check.id).toBeDefined();
        expect(check.user_id).toBe(user.id);
        expect(check.check_type).toBe("email");
        expect(check.last_checked_at).toBeNull();
        expect(check.enabled).toBe(1);
      });

      it("should return existing record if already exists", () => {
        const user = createTestUser();

        const first = getOrCreateBackgroundCheck(user.id, "email");
        const second = getOrCreateBackgroundCheck(user.id, "email");

        expect(first.id).toBe(second.id);
      });

      it("should create separate records for different check types", () => {
        const user = createTestUser();

        const emailCheck = getOrCreateBackgroundCheck(user.id, "email");
        const calendarCheck = getOrCreateBackgroundCheck(user.id, "calendar");

        expect(emailCheck.id).not.toBe(calendarCheck.id);
        expect(emailCheck.check_type).toBe("email");
        expect(calendarCheck.check_type).toBe("calendar");
      });
    });

    describe("updateBackgroundCheck", () => {
      it("should update last checked timestamp", () => {
        const user = createTestUser();
        getOrCreateBackgroundCheck(user.id, "email");

        updateBackgroundCheck(user.id, "email");

        const db = getTestDb();
        const check = db
          .prepare(
            `SELECT last_checked_at FROM background_checks WHERE user_id = ? AND check_type = ?`
          )
          .get(user.id, "email") as { last_checked_at: string };

        expect(check.last_checked_at).toBeDefined();
      });

      it("should update last item id", () => {
        const user = createTestUser();
        getOrCreateBackgroundCheck(user.id, "email");

        updateBackgroundCheck(user.id, "email", "msg_12345");

        const db = getTestDb();
        const check = db
          .prepare(
            `SELECT last_item_id FROM background_checks WHERE user_id = ? AND check_type = ?`
          )
          .get(user.id, "email") as { last_item_id: string };

        expect(check.last_item_id).toBe("msg_12345");
      });
    });
  });

  // ============================================
  // Scenario Tests
  // ============================================

  describe("Briefing Scenarios", () => {
    it("Scenario: Busy Monday morning", () => {
      const summary = generateBriefingSummary({
        calendarEvents: [
          {
            id: "1",
            summary: "Team Standup",
            start: "2024-01-15T09:00:00",
            end: "2024-01-15T09:30:00",
          },
          {
            id: "2",
            summary: "Sprint Planning",
            start: "2024-01-15T10:00:00",
            end: "2024-01-15T12:00:00",
          },
          {
            id: "3",
            summary: "Lunch with Client",
            start: "2024-01-15T12:30:00",
            end: "2024-01-15T13:30:00",
          },
          {
            id: "4",
            summary: "Code Review Session",
            start: "2024-01-15T14:00:00",
            end: "2024-01-15T15:00:00",
          },
          {
            id: "5",
            summary: "1:1 with Manager",
            start: "2024-01-15T16:00:00",
            end: "2024-01-15T16:30:00",
          },
        ],
        emails: [
          {
            id: "1",
            from: "CEO <ceo@company.com>",
            subject: "Q1 Goals - Action Required",
            snippet: "Please review...",
            date: "",
          },
          {
            id: "2",
            from: "HR <hr@company.com>",
            subject: "Benefits Enrollment Reminder",
            snippet: "Deadline approaching...",
            date: "",
          },
          {
            id: "3",
            from: "Client <client@external.com>",
            subject: "Contract Review",
            snippet: "Attached is...",
            date: "",
          },
        ],
        unreadCount: 12,
        tasks: [
          { id: "1", title: "Finish API documentation", status: "in_progress" },
          { id: "2", title: "Review team PRs", status: "todo" },
        ],
        hasGoogle: true,
        hasNotion: true,
      });

      expect(summary).toContain("5 events");
      expect(summary).toContain("12 unread");
      expect(summary).toContain("2 items");
      expect(summary).toContain("Team Standup");
      expect(summary).toContain("CEO");
    });

    it("Scenario: Quiet Friday afternoon", () => {
      const summary = generateBriefingSummary({
        calendarEvents: [
          {
            id: "1",
            summary: "Weekly Wrap-up",
            start: "2024-01-19T16:00:00",
            end: "2024-01-19T17:00:00",
          },
        ],
        emails: [],
        unreadCount: 0,
        tasks: [],
        hasGoogle: true,
        hasNotion: true,
      });

      expect(summary).toContain("1 events");
      expect(summary).toContain("All caught up");
      expect(summary).toContain("Weekly Wrap-up");
    });

    it("Scenario: Email overload", () => {
      const emails = [];
      for (let i = 0; i < 10; i++) {
        emails.push({
          id: `${i}`,
          from: `sender${i}@example.com`,
          subject: `Email ${i + 1}`,
          snippet: "...",
          date: "",
        });
      }

      const summary = generateBriefingSummary({
        calendarEvents: [],
        emails,
        unreadCount: 47,
        tasks: [],
        hasGoogle: true,
        hasNotion: false,
      });

      expect(summary).toContain("47 unread");
      expect(summary).toContain("...and 44 more unread emails");
    });

    it("Scenario: New user with no integrations", () => {
      const summary = generateBriefingSummary({
        calendarEvents: [],
        emails: [],
        unreadCount: 0,
        tasks: [],
        hasGoogle: false,
        hasNotion: false,
      });

      expect(summary).toContain("Connect Google or Notion in Settings");
    });

    it("Scenario: Only Notion connected", () => {
      const summary = generateBriefingSummary({
        calendarEvents: [],
        emails: [],
        unreadCount: 0,
        tasks: [{ id: "1", title: "Daily standup notes", status: "todo" }],
        hasGoogle: false,
        hasNotion: true,
      });

      expect(summary).toContain("Connect Google in Settings");
      expect(summary).toContain("Tasks");
    });
  });
});
