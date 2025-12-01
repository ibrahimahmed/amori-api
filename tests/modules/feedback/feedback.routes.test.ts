import { describe, expect, it, beforeEach, mock } from "bun:test";
import { Elysia } from "elysia";

// Test data
const TEST_USER_ID = "550e8400-e29b-41d4-a716-446655440000";
const TEST_FEEDBACK_ID = "660e8400-e29b-41d4-a716-446655440001";

const mockFeedback = {
  id: TEST_FEEDBACK_ID,
  user_id: TEST_USER_ID,
  type: "bug_report",
  subject: "App crashes on login",
  message: "The app crashes whenever I try to login with my email",
  contact_email: "user@example.com",
  priority: "high",
  status: "open",
  screenshot_url: null,
  device_info: "iPhone 15 Pro, iOS 17.1",
  app_version: "1.0.0",
  admin_notes: null,
  resolved_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const mockStats = {
  total: 10,
  byType: { bug_report: 5, feedback: 3, feature_request: 2 },
  byStatus: { open: 4, in_progress: 3, resolved: 2, closed: 1 },
  byPriority: { low: 2, medium: 4, high: 3, critical: 1 },
};

// Mock service
const mockFeedbackService = {
  getAll: mock((_filters?: any) => Promise.resolve([mockFeedback])),
  getByUserId: mock((_userId: string) => Promise.resolve([mockFeedback])),
  getById: mock((_feedbackId: string) => Promise.resolve(mockFeedback as typeof mockFeedback | undefined)),
  create: mock((_data: any, _userName?: string) => Promise.resolve(mockFeedback)),
  update: mock((_feedbackId: string, _data: any) => Promise.resolve(mockFeedback as typeof mockFeedback | undefined)),
  delete: mock((_feedbackId: string) => Promise.resolve(true)),
  getStatistics: mock(() => Promise.resolve(mockStats)),
};

// Mock ServiceError
class MockServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

// Valid feedback types, statuses, and priorities
const FEEDBACK_TYPES = ["bug_report", "feedback", "feature_request"];
const FEEDBACK_STATUSES = ["open", "in_progress", "resolved", "closed"];
const FEEDBACK_PRIORITIES = ["low", "medium", "high", "critical"];

// Create test app for public endpoints
function createPublicTestApp() {
  return new Elysia({ prefix: "/feedback" })
    .post("/", async ({ body, set }) => {
      try {
        const reqBody = body as any;
        // Validate type
        if (!FEEDBACK_TYPES.includes(reqBody.type)) {
          set.status = 400;
          return { success: false, error: "Invalid feedback type. Must be: bug_report, feedback, or feature_request" };
        }
        // Validate priority if provided
        if (reqBody.priority && !FEEDBACK_PRIORITIES.includes(reqBody.priority)) {
          set.status = 400;
          return { success: false, error: "Invalid priority. Must be: low, medium, high, or critical" };
        }
        const feedback = await mockFeedbackService.create(reqBody, reqBody.user_name);
        set.status = 201;
        return {
          success: true,
          data: feedback,
          message: "Thank you for your feedback! Our team will review it shortly.",
        };
      } catch (error) {
        if (error instanceof MockServiceError) {
          set.status = error.statusCode;
          return { success: false, error: error.message };
        }
        set.status = 500;
        return { success: false, error: "Internal server error" };
      }
    });
}

// Create test app for authenticated endpoints
function createAuthenticatedTestApp() {
  return new Elysia({ prefix: "/feedback" })
    .derive(() => ({
      user: { id: TEST_USER_ID, email: "test@example.com", name: "Test User", avatar_url: null },
    }))
    .get("/my", async ({ user, set }) => {
      try {
        const feedbacks = await mockFeedbackService.getByUserId(user.id);
        return { success: true, data: feedbacks };
      } catch (error) {
        set.status = 500;
        return { success: false, error: "Internal server error" };
      }
    })
    .post("/submit", async ({ user, body, set }) => {
      try {
        const reqBody = body as any;
        if (!FEEDBACK_TYPES.includes(reqBody.type)) {
          set.status = 400;
          return { success: false, error: "Invalid feedback type. Must be: bug_report, feedback, or feature_request" };
        }
        if (reqBody.priority && !FEEDBACK_PRIORITIES.includes(reqBody.priority)) {
          set.status = 400;
          return { success: false, error: "Invalid priority. Must be: low, medium, high, or critical" };
        }
        const feedback = await mockFeedbackService.create({
          user_id: user.id,
          ...reqBody,
          contact_email: reqBody.contact_email || user.email,
        }, user.name || undefined);
        set.status = 201;
        return {
          success: true,
          data: feedback,
          message: "Thank you for your feedback! Our team will review it shortly.",
        };
      } catch (error) {
        set.status = 500;
        return { success: false, error: "Internal server error" };
      }
    })
    .get("/admin/all", async ({ query, set }) => {
      try {
        if (query.type && !FEEDBACK_TYPES.includes(query.type)) {
          set.status = 400;
          return { success: false, error: "Invalid type filter" };
        }
        if (query.status && !FEEDBACK_STATUSES.includes(query.status)) {
          set.status = 400;
          return { success: false, error: "Invalid status filter" };
        }
        if (query.priority && !FEEDBACK_PRIORITIES.includes(query.priority)) {
          set.status = 400;
          return { success: false, error: "Invalid priority filter" };
        }
        const feedbacks = await mockFeedbackService.getAll({
          type: query.type,
          status: query.status,
          priority: query.priority,
        });
        return { success: true, data: feedbacks };
      } catch (error) {
        set.status = 500;
        return { success: false, error: "Internal server error" };
      }
    })
    .get("/admin/stats", async ({ set }) => {
      try {
        const stats = await mockFeedbackService.getStatistics();
        return { success: true, data: stats };
      } catch (error) {
        set.status = 500;
        return { success: false, error: "Internal server error" };
      }
    })
    .get("/admin/:id", async ({ params, set }) => {
      try {
        const feedback = await mockFeedbackService.getById(params.id);
        if (!feedback) {
          set.status = 404;
          return { success: false, error: "Feedback not found" };
        }
        return { success: true, data: feedback };
      } catch (error) {
        set.status = 500;
        return { success: false, error: "Internal server error" };
      }
    })
    .patch("/admin/:id", async ({ params, body, set }) => {
      try {
        const reqBody = body as any;
        if (reqBody.status && !FEEDBACK_STATUSES.includes(reqBody.status)) {
          set.status = 400;
          return { success: false, error: "Invalid status" };
        }
        if (reqBody.priority && !FEEDBACK_PRIORITIES.includes(reqBody.priority)) {
          set.status = 400;
          return { success: false, error: "Invalid priority" };
        }
        const feedback = await mockFeedbackService.update(params.id, reqBody);
        if (!feedback) {
          set.status = 404;
          return { success: false, error: "Feedback not found" };
        }
        return { success: true, data: feedback };
      } catch (error) {
        set.status = 500;
        return { success: false, error: "Internal server error" };
      }
    })
    .delete("/admin/:id", async ({ params, set }) => {
      try {
        const deleted = await mockFeedbackService.delete(params.id);
        if (!deleted) {
          set.status = 404;
          return { success: false, error: "Feedback not found" };
        }
        set.status = 204;
        return null;
      } catch (error) {
        set.status = 500;
        return { success: false, error: "Internal server error" };
      }
    });
}

// Helper to reset all mocks
function resetMocks() {
  mockFeedbackService.getAll.mockClear();
  mockFeedbackService.getByUserId.mockClear();
  mockFeedbackService.getById.mockClear();
  mockFeedbackService.create.mockClear();
  mockFeedbackService.update.mockClear();
  mockFeedbackService.delete.mockClear();
  mockFeedbackService.getStatistics.mockClear();
  // Default implementations
  mockFeedbackService.getAll.mockImplementation(() => Promise.resolve([mockFeedback]));
  mockFeedbackService.getByUserId.mockImplementation(() => Promise.resolve([mockFeedback]));
  mockFeedbackService.getById.mockImplementation(() => Promise.resolve(mockFeedback));
  mockFeedbackService.create.mockImplementation(() => Promise.resolve(mockFeedback));
  mockFeedbackService.update.mockImplementation(() => Promise.resolve(mockFeedback));
  mockFeedbackService.delete.mockImplementation(() => Promise.resolve(true));
  mockFeedbackService.getStatistics.mockImplementation(() => Promise.resolve(mockStats));
}

describe("Feedback Routes - Public", () => {
  let app: ReturnType<typeof createPublicTestApp>;

  beforeEach(() => {
    app = createPublicTestApp();
    resetMocks();
  });

  describe("POST /feedback", () => {
    const validBugReport = {
      type: "bug_report",
      subject: "App crashes on startup",
      message: "The app crashes whenever I try to open it on my device",
      contact_email: "reporter@example.com",
      device_info: "iPhone 15, iOS 17",
      app_version: "1.2.0",
    };

    it("should create feedback successfully", async () => {
      const response = await app.handle(
        new Request("http://localhost/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validBugReport),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.message).toContain("Thank you");
      expect(mockFeedbackService.create).toHaveBeenCalled();
    });

    it("should create anonymous feedback", async () => {
      const anonymousFeedback = {
        type: "feedback",
        subject: "Great app!",
        message: "I really love using this application",
      };

      const response = await app.handle(
        new Request("http://localhost/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(anonymousFeedback),
        })
      );

      expect(response.status).toBe(201);
    });

    it("should reject invalid feedback type", async () => {
      const invalidFeedback = {
        type: "invalid_type",
        subject: "Test",
        message: "This should fail because of invalid type",
      };

      const response = await app.handle(
        new Request("http://localhost/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(invalidFeedback),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain("Invalid feedback type");
    });

    it("should reject invalid priority", async () => {
      const invalidPriority = {
        ...validBugReport,
        priority: "super_urgent",
      };

      const response = await app.handle(
        new Request("http://localhost/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(invalidPriority),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Invalid priority");
    });

    it("should accept valid priority", async () => {
      const withPriority = {
        ...validBugReport,
        priority: "critical",
      };

      const response = await app.handle(
        new Request("http://localhost/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(withPriority),
        })
      );

      expect(response.status).toBe(201);
    });

    it("should create feature request", async () => {
      const featureRequest = {
        type: "feature_request",
        subject: "Add dark mode",
        message: "Please add a dark mode option to reduce eye strain",
      };

      const response = await app.handle(
        new Request("http://localhost/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(featureRequest),
        })
      );

      expect(response.status).toBe(201);
    });

    it("should handle service error", async () => {
      mockFeedbackService.create.mockImplementation(() => {
        throw new MockServiceError("Database error", "DATABASE", 500);
      });

      const response = await app.handle(
        new Request("http://localhost/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validBugReport),
        })
      );

      expect(response.status).toBe(500);
    });
  });
});

describe("Feedback Routes - Authenticated", () => {
  let app: ReturnType<typeof createAuthenticatedTestApp>;

  beforeEach(() => {
    app = createAuthenticatedTestApp();
    resetMocks();
  });

  describe("GET /feedback/my", () => {
    it("should return user's feedback", async () => {
      const response = await app.handle(new Request("http://localhost/feedback/my"));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual([mockFeedback]);
      expect(mockFeedbackService.getByUserId).toHaveBeenCalledWith(TEST_USER_ID);
    });

    it("should return empty array when user has no feedback", async () => {
      mockFeedbackService.getByUserId.mockImplementation(() => Promise.resolve([]));

      const response = await app.handle(new Request("http://localhost/feedback/my"));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toEqual([]);
    });
  });

  describe("POST /feedback/submit", () => {
    const validSubmission = {
      type: "bug_report",
      subject: "Login issue",
      message: "Cannot login with my credentials anymore",
    };

    it("should create feedback with user info", async () => {
      const response = await app.handle(
        new Request("http://localhost/feedback/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validSubmission),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(mockFeedbackService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: TEST_USER_ID,
          contact_email: "test@example.com",
        }),
        "Test User"
      );
    });

    it("should reject invalid feedback type", async () => {
      const response = await app.handle(
        new Request("http://localhost/feedback/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...validSubmission, type: "invalid" }),
        })
      );

      expect(response.status).toBe(400);
    });
  });

  describe("GET /feedback/admin/all", () => {
    it("should return all feedback", async () => {
      const response = await app.handle(new Request("http://localhost/feedback/admin/all"));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual([mockFeedback]);
    });

    it("should filter by type", async () => {
      const response = await app.handle(
        new Request("http://localhost/feedback/admin/all?type=bug_report")
      );

      expect(response.status).toBe(200);
      expect(mockFeedbackService.getAll).toHaveBeenCalledWith(
        expect.objectContaining({ type: "bug_report" })
      );
    });

    it("should filter by status", async () => {
      const response = await app.handle(
        new Request("http://localhost/feedback/admin/all?status=open")
      );

      expect(response.status).toBe(200);
      expect(mockFeedbackService.getAll).toHaveBeenCalledWith(
        expect.objectContaining({ status: "open" })
      );
    });

    it("should filter by priority", async () => {
      const response = await app.handle(
        new Request("http://localhost/feedback/admin/all?priority=high")
      );

      expect(response.status).toBe(200);
      expect(mockFeedbackService.getAll).toHaveBeenCalledWith(
        expect.objectContaining({ priority: "high" })
      );
    });

    it("should reject invalid type filter", async () => {
      const response = await app.handle(
        new Request("http://localhost/feedback/admin/all?type=invalid")
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Invalid type filter");
    });

    it("should reject invalid status filter", async () => {
      const response = await app.handle(
        new Request("http://localhost/feedback/admin/all?status=invalid")
      );

      expect(response.status).toBe(400);
    });

    it("should reject invalid priority filter", async () => {
      const response = await app.handle(
        new Request("http://localhost/feedback/admin/all?priority=invalid")
      );

      expect(response.status).toBe(400);
    });
  });

  describe("GET /feedback/admin/stats", () => {
    it("should return statistics", async () => {
      const response = await app.handle(new Request("http://localhost/feedback/admin/stats"));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual(mockStats);
    });
  });

  describe("GET /feedback/admin/:id", () => {
    it("should return feedback by ID", async () => {
      const response = await app.handle(
        new Request(`http://localhost/feedback/admin/${TEST_FEEDBACK_ID}`)
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toEqual(mockFeedback);
    });

    it("should return 404 when not found", async () => {
      mockFeedbackService.getById.mockImplementation(() => Promise.resolve(undefined));

      const response = await app.handle(
        new Request("http://localhost/feedback/admin/nonexistent")
      );

      expect(response.status).toBe(404);
    });
  });

  describe("PATCH /feedback/admin/:id", () => {
    it("should update feedback status", async () => {
      const updatedFeedback = { ...mockFeedback, status: "in_progress" };
      mockFeedbackService.update.mockImplementation(() => Promise.resolve(updatedFeedback));

      const response = await app.handle(
        new Request(`http://localhost/feedback/admin/${TEST_FEEDBACK_ID}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "in_progress" }),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.status).toBe("in_progress");
    });

    it("should update admin notes", async () => {
      const updatedFeedback = { ...mockFeedback, admin_notes: "Working on fix" };
      mockFeedbackService.update.mockImplementation(() => Promise.resolve(updatedFeedback));

      const response = await app.handle(
        new Request(`http://localhost/feedback/admin/${TEST_FEEDBACK_ID}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ admin_notes: "Working on fix" }),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.admin_notes).toBe("Working on fix");
    });

    it("should reject invalid status", async () => {
      const response = await app.handle(
        new Request(`http://localhost/feedback/admin/${TEST_FEEDBACK_ID}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "invalid_status" }),
        })
      );

      expect(response.status).toBe(400);
    });

    it("should reject invalid priority", async () => {
      const response = await app.handle(
        new Request(`http://localhost/feedback/admin/${TEST_FEEDBACK_ID}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ priority: "invalid_priority" }),
        })
      );

      expect(response.status).toBe(400);
    });

    it("should return 404 when not found", async () => {
      mockFeedbackService.update.mockImplementation(() => Promise.resolve(undefined));

      const response = await app.handle(
        new Request(`http://localhost/feedback/admin/${TEST_FEEDBACK_ID}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "resolved" }),
        })
      );

      expect(response.status).toBe(404);
    });
  });

  describe("DELETE /feedback/admin/:id", () => {
    it("should delete feedback", async () => {
      const response = await app.handle(
        new Request(`http://localhost/feedback/admin/${TEST_FEEDBACK_ID}`, {
          method: "DELETE",
        })
      );

      expect(response.status).toBe(204);
    });

    it("should return 404 when not found", async () => {
      mockFeedbackService.delete.mockImplementation(() => Promise.resolve(false));

      const response = await app.handle(
        new Request(`http://localhost/feedback/admin/${TEST_FEEDBACK_ID}`, {
          method: "DELETE",
        })
      );

      expect(response.status).toBe(404);
    });
  });
});

