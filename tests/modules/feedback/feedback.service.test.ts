// Environment variables are set in tests/setup.ts (preloaded by bun)
import { describe, expect, it, beforeEach, mock } from "bun:test";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Mock DB chain methods - use 'any' for flexibility in tests
const mockExecute = mock((): Promise<any> => Promise.resolve([]));
const mockExecuteTakeFirst = mock((): Promise<any> => Promise.resolve(null));

const mockDbChain = {
  selectFrom: () => mockDbChain,
  insertInto: () => mockDbChain,
  updateTable: () => mockDbChain,
  deleteFrom: () => mockDbChain,
  selectAll: () => mockDbChain,
  select: () => mockDbChain,
  values: () => mockDbChain,
  set: () => mockDbChain,
  where: () => mockDbChain,
  orderBy: () => mockDbChain,
  returningAll: () => mockDbChain,
  execute: mockExecute,
  executeTakeFirst: mockExecuteTakeFirst,
};

// Mock logger
const mockLogger = {
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {},
};

// Mock email functions
const mockSendEmail = mock((): Promise<boolean> => Promise.resolve(true));
const mockIsEmailEnabled = mock((): boolean => true);

// Setup module mocks
mock.module("../../../src/libs/db/client", () => ({
  db: mockDbChain,
}));

mock.module("../../../src/libs/logger", () => ({
  logger: mockLogger,
}));

mock.module("../../../src/libs/email", () => ({
  sendEmail: mockSendEmail,
  isEmailEnabled: mockIsEmailEnabled,
}));

mock.module("../../../src/config/env", () => ({
  env: {
    SUPPORT_EMAIL: "test-support@amori.app",
  },
}));

// Import after mocks are set up
import { FeedbackService, ServiceError } from "../../../src/modules/feedback/feedback.service";

// Test data
const TEST_USER_ID = "user-123-456-789";
const TEST_FEEDBACK_ID = "feedback-123-456-789";

const mockFeedback = {
  id: TEST_FEEDBACK_ID,
  user_id: TEST_USER_ID,
  type: "bug_report" as const,
  subject: "App crashes on login",
  message: "The app crashes whenever I try to login with my email",
  contact_email: "user@example.com",
  priority: "high" as const,
  status: "open" as const,
  screenshot_url: "https://example.com/screenshot.png",
  device_info: "iPhone 15 Pro, iOS 17.1",
  app_version: "1.0.0",
  admin_notes: null,
  resolved_at: null,
  created_at: new Date(),
  updated_at: new Date(),
};

const mockFeatureRequest = {
  ...mockFeedback,
  id: "feedback-456-789-123",
  type: "feature_request" as const,
  subject: "Add dark mode",
  message: "Please add a dark mode option to the app",
  priority: "medium" as const,
};

const mockGeneralFeedback = {
  ...mockFeedback,
  id: "feedback-789-123-456",
  type: "feedback" as const,
  subject: "Great app!",
  message: "I really love using this app, keep up the good work!",
  priority: "low" as const,
};

// Helper to reset all mocks
function resetMocks() {
  mockExecute.mockReset();
  mockExecuteTakeFirst.mockReset();
  mockSendEmail.mockReset();
  mockIsEmailEnabled.mockReset();
  // Set defaults
  mockExecute.mockImplementation(() => Promise.resolve([]));
  mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(null));
  mockSendEmail.mockImplementation(() => Promise.resolve(true));
  mockIsEmailEnabled.mockImplementation(() => true);
}

describe("FeedbackService", () => {
  let service: FeedbackService;

  beforeEach(() => {
    service = new FeedbackService();
    resetMocks();
  });

  describe("getAll", () => {
    it("should return all feedback entries", async () => {
      mockExecute.mockImplementation(() => Promise.resolve([mockFeedback, mockFeatureRequest]));

      const result = await service.getAll();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(mockFeedback);
    });

    it("should filter by type", async () => {
      mockExecute.mockImplementation(() => Promise.resolve([mockFeedback]));

      const result = await service.getAll({ type: "bug_report" });

      expect(result).toHaveLength(1);
      expect(mockExecute).toHaveBeenCalled();
    });

    it("should filter by status", async () => {
      mockExecute.mockImplementation(() => Promise.resolve([mockFeedback]));

      const result = await service.getAll({ status: "open" });

      expect(result).toHaveLength(1);
      expect(mockExecute).toHaveBeenCalled();
    });

    it("should filter by priority", async () => {
      mockExecute.mockImplementation(() => Promise.resolve([mockFeedback]));

      const result = await service.getAll({ priority: "high" });

      expect(result).toHaveLength(1);
      expect(mockExecute).toHaveBeenCalled();
    });

    it("should apply multiple filters", async () => {
      mockExecute.mockImplementation(() => Promise.resolve([mockFeedback]));

      await service.getAll({
        type: "bug_report",
        status: "open",
        priority: "high",
      });

      expect(mockExecute).toHaveBeenCalled();
    });

    it("should return empty array when no feedback found", async () => {
      mockExecute.mockImplementation(() => Promise.resolve([]));

      const result = await service.getAll();

      expect(result).toEqual([]);
    });

    it("should throw ServiceError on database error", async () => {
      mockExecute.mockImplementation(() => Promise.reject(new Error("DB Error")));

      await expect(service.getAll()).rejects.toThrow(ServiceError);
    });
  });

  describe("getByUserId", () => {
    it("should return feedback for a specific user", async () => {
      mockExecute.mockImplementation(() => Promise.resolve([mockFeedback]));

      const result = await service.getByUserId(TEST_USER_ID);

      expect(result).toHaveLength(1);
      expect(result[0].user_id).toBe(TEST_USER_ID);
    });

    it("should return empty array when user has no feedback", async () => {
      mockExecute.mockImplementation(() => Promise.resolve([]));

      const result = await service.getByUserId("nonexistent-user");

      expect(result).toEqual([]);
    });

    it("should throw ServiceError on database error", async () => {
      mockExecute.mockImplementation(() => Promise.reject(new Error("DB Error")));

      await expect(service.getByUserId(TEST_USER_ID)).rejects.toThrow(ServiceError);
    });
  });

  describe("getById", () => {
    it("should return feedback when found", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(mockFeedback));

      const result = await service.getById(TEST_FEEDBACK_ID);

      expect(result).toEqual(mockFeedback);
    });

    it("should return undefined when feedback not found", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(undefined));

      const result = await service.getById("nonexistent-id");

      expect(result).toBeUndefined();
    });

    it("should throw ServiceError on database error", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.reject(new Error("DB Error")));

      await expect(service.getById(TEST_FEEDBACK_ID)).rejects.toThrow(ServiceError);
    });
  });

  describe("create", () => {
    const createBugReport = {
      user_id: TEST_USER_ID,
      type: "bug_report" as const,
      subject: "New Bug",
      message: "This is a detailed bug report with more than 10 characters",
      contact_email: "user@test.com",
    };

    const createFeatureRequest = {
      user_id: TEST_USER_ID,
      type: "feature_request" as const,
      subject: "New Feature",
      message: "Please add this awesome feature to improve user experience",
    };

    it("should create bug report with high priority by default", async () => {
      const createdFeedback = {
        ...mockFeedback,
        ...createBugReport,
        priority: "high" as const,
        status: "open" as const,
      };
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(createdFeedback));

      const result = await service.create(createBugReport);

      expect(result).toEqual(createdFeedback);
      expect(result?.priority).toBe("high");
    });

    it("should create feature request with medium priority by default", async () => {
      const createdFeedback = {
        ...mockFeatureRequest,
        ...createFeatureRequest,
        priority: "medium" as const,
        status: "open" as const,
      };
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(createdFeedback));

      const result = await service.create(createFeatureRequest);

      expect(result?.priority).toBe("medium");
    });

    it("should use custom priority when provided", async () => {
      const createWithPriority = { ...createBugReport, priority: "critical" as const };
      const createdFeedback = { ...mockFeedback, ...createWithPriority, status: "open" };
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(createdFeedback));

      const result = await service.create(createWithPriority);

      expect(result?.priority).toBe("critical");
    });

    it("should send email notification on successful creation", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(mockFeedback));

      await service.create(createBugReport, "Test User");

      expect(mockSendEmail).toHaveBeenCalled();
    });

    it("should not send email when email is disabled", async () => {
      mockIsEmailEnabled.mockImplementation(() => false);
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(mockFeedback));

      await service.create(createBugReport);

      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("should not fail if email sending fails", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(mockFeedback));
      mockSendEmail.mockImplementation(() => Promise.reject(new Error("Email failed")));

      const result = await service.create(createBugReport);

      expect(result).toEqual(mockFeedback);
    });

    it("should create anonymous feedback (no user_id)", async () => {
      const anonymousFeedback = {
        type: "feedback" as const,
        subject: "Anonymous feedback",
        message: "This is anonymous feedback from a visitor",
        contact_email: "anonymous@test.com",
      };
      const createdFeedback = {
        ...mockGeneralFeedback,
        ...anonymousFeedback,
        user_id: null,
        priority: "medium",
        status: "open",
      };
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(createdFeedback));

      const result = await service.create(anonymousFeedback);

      expect(result?.user_id).toBeNull();
    });

    it("should throw ServiceError on database error", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.reject(new Error("DB Error")));

      await expect(service.create(createBugReport)).rejects.toThrow(ServiceError);
    });
  });

  describe("update", () => {
    const updateData = { status: "in_progress" as const };

    it("should update feedback", async () => {
      const updatedFeedback = { ...mockFeedback, ...updateData };
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(updatedFeedback));

      const result = await service.update(TEST_FEEDBACK_ID, updateData);

      expect(result).toEqual(updatedFeedback);
      expect(result?.status).toBe("in_progress");
    });

    it("should set resolved_at when status is resolved", async () => {
      const resolveData = { status: "resolved" as const };
      const resolvedFeedback = {
        ...mockFeedback,
        status: "resolved",
        resolved_at: new Date(),
      };
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(resolvedFeedback));

      const result = await service.update(TEST_FEEDBACK_ID, resolveData);

      expect(result?.status).toBe("resolved");
      expect(result?.resolved_at).toBeDefined();
    });

    it("should update admin notes", async () => {
      const notesData = { admin_notes: "Investigating this issue" };
      const updatedFeedback = { ...mockFeedback, ...notesData };
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(updatedFeedback));

      const result = await service.update(TEST_FEEDBACK_ID, notesData);

      expect(result?.admin_notes).toBe("Investigating this issue");
    });

    it("should return undefined when feedback not found", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(undefined));

      const result = await service.update("nonexistent-id", updateData);

      expect(result).toBeUndefined();
    });

    it("should throw ServiceError on database error", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.reject(new Error("DB Error")));

      await expect(service.update(TEST_FEEDBACK_ID, updateData)).rejects.toThrow(ServiceError);
    });
  });

  describe("delete", () => {
    it("should delete feedback and return true", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve({ numDeletedRows: 1n }));

      const result = await service.delete(TEST_FEEDBACK_ID);

      expect(result).toBe(true);
    });

    it("should return false when nothing deleted", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve({ numDeletedRows: 0n }));

      const result = await service.delete("nonexistent-id");

      expect(result).toBe(false);
    });

    it("should throw ServiceError on database error", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.reject(new Error("DB Error")));

      await expect(service.delete(TEST_FEEDBACK_ID)).rejects.toThrow(ServiceError);
    });
  });

  describe("getStatistics", () => {
    it("should return aggregated statistics", async () => {
      const feedbacks = [
        { ...mockFeedback, type: "bug_report", status: "open", priority: "high" },
        { ...mockFeatureRequest, type: "feature_request", status: "in_progress", priority: "medium" },
        { ...mockGeneralFeedback, type: "feedback", status: "resolved", priority: "low" },
      ];
      mockExecute.mockImplementation(() => Promise.resolve(feedbacks));

      const result = await service.getStatistics();

      expect(result.total).toBe(3);
      expect(result.byType.bug_report).toBe(1);
      expect(result.byType.feature_request).toBe(1);
      expect(result.byType.feedback).toBe(1);
      expect(result.byStatus.open).toBe(1);
      expect(result.byStatus.in_progress).toBe(1);
      expect(result.byStatus.resolved).toBe(1);
      expect(result.byPriority.high).toBe(1);
      expect(result.byPriority.medium).toBe(1);
      expect(result.byPriority.low).toBe(1);
    });

    it("should return zero counts when no feedback exists", async () => {
      mockExecute.mockImplementation(() => Promise.resolve([]));

      const result = await service.getStatistics();

      expect(result.total).toBe(0);
      expect(result.byType.bug_report).toBe(0);
      expect(result.byType.feature_request).toBe(0);
      expect(result.byType.feedback).toBe(0);
    });

    it("should throw ServiceError on database error", async () => {
      mockExecute.mockImplementation(() => Promise.reject(new Error("DB Error")));

      await expect(service.getStatistics()).rejects.toThrow(ServiceError);
    });
  });
});

describe("ServiceError", () => {
  it("should create error with correct properties", () => {
    const error = new ServiceError("Test error", "DATABASE", 500);

    expect(error.message).toBe("Test error");
    expect(error.code).toBe("DATABASE");
    expect(error.statusCode).toBe(500);
    expect(error.name).toBe("ServiceError");
  });

  it("should default statusCode to 500", () => {
    const error = new ServiceError("Test error", "INTERNAL");

    expect(error.statusCode).toBe(500);
  });
});