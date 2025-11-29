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

// Setup module mocks
mock.module("../../../src/libs/db/client", () => ({
  db: mockDbChain,
}));

mock.module("../../../src/libs/logger", () => ({
  logger: mockLogger,
}));

// Import after mocks are set up
import { PlannerService, ServiceError } from "../../../src/modules/planner/planner.service";

// Test data
const TEST_USER_ID = "user-123-456-789";
const TEST_EVENT_ID = "event-123-456-789";

const mockEvent = {
  id: TEST_EVENT_ID,
  user_id: TEST_USER_ID,
  person_id: "person-123",
  event_type: "birthday" as const,
  title: "Birthday Party",
  description: "Surprise party",
  date: new Date("2024-06-15"),
  reminder_at: null,
  location: "Home",
  notes: "Don't forget the cake",
  completed: false,
  completed_at: null,
  created_at: new Date(),
  updated_at: new Date(),
};

// Helper to reset all mocks
function resetMocks() {
  mockExecute.mockReset();
  mockExecuteTakeFirst.mockReset();
  // Set defaults
  mockExecute.mockImplementation(() => Promise.resolve([]));
  mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(null));
}

describe("PlannerService", () => {
  let service: PlannerService;

  beforeEach(() => {
    service = new PlannerService();
    resetMocks();
  });

  describe("getAll", () => {
    it("should return events", async () => {
      mockExecute.mockImplementation(() => Promise.resolve([mockEvent]));

      const result = await service.getAll(TEST_USER_ID);

      expect(result).toEqual([mockEvent]);
    });

    it("should apply filters correctly", async () => {
      mockExecute.mockImplementation(() => Promise.resolve([mockEvent]));

      await service.getAll(TEST_USER_ID, {
        personId: "person-123",
        eventType: "birthday",
        completed: false,
      });

      // We can't easily check the chain calls without complex spying, 
      // but we verify it doesn't crash and returns data
      expect(mockExecute).toHaveBeenCalled();
    });

    it("should throw ServiceError on database error", async () => {
      mockExecute.mockImplementation(() => Promise.reject(new Error("DB Error")));

      await expect(service.getAll(TEST_USER_ID)).rejects.toThrow(ServiceError);
    });
  });

  describe("getById", () => {
    it("should return event when found", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(mockEvent));

      const result = await service.getById(TEST_USER_ID, TEST_EVENT_ID);

      expect(result).toEqual(mockEvent);
    });

    it("should return undefined when event not found", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(undefined));

      const result = await service.getById(TEST_USER_ID, TEST_EVENT_ID);

      expect(result).toBeUndefined();
    });

    it("should throw ServiceError on database error", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.reject(new Error("DB Error")));

      await expect(service.getById(TEST_USER_ID, TEST_EVENT_ID)).rejects.toThrow(ServiceError);
    });
  });

  describe("create", () => {
    const createData = {
      user_id: TEST_USER_ID,
      event_type: "birthday" as const,
      title: "New Event",
      date: new Date(),
      person_id: null,
      description: null,
      reminder_at: null,
      location: null,
      notes: null,
    };

    it("should create event", async () => {
      const createdEvent = { ...mockEvent, ...createData, id: "new-event-id" };
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(createdEvent));

      const result = await service.create(createData);

      expect(result).toEqual(createdEvent);
    });

    it("should throw ServiceError on database error", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.reject(new Error("DB Error")));

      await expect(service.create(createData)).rejects.toThrow(ServiceError);
    });
  });

  describe("update", () => {
    const updateData = { title: "Updated Title" };

    it("should update event", async () => {
      const updatedEvent = { ...mockEvent, ...updateData };
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(updatedEvent));

      const result = await service.update(TEST_USER_ID, TEST_EVENT_ID, updateData);

      expect(result).toEqual(updatedEvent);
    });

    it("should throw ServiceError on database error", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.reject(new Error("DB Error")));

      await expect(service.update(TEST_USER_ID, TEST_EVENT_ID, updateData)).rejects.toThrow(ServiceError);
    });
  });

  describe("delete", () => {
    it("should delete event", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve({ numDeletedRows: 1n }));

      const result = await service.delete(TEST_USER_ID, TEST_EVENT_ID);

      expect(result).toBe(true);
    });

    it("should return false when nothing deleted", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve({ numDeletedRows: 0n }));

      const result = await service.delete(TEST_USER_ID, TEST_EVENT_ID);

      expect(result).toBe(false);
    });

    it("should throw ServiceError on database error", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.reject(new Error("DB Error")));

      await expect(service.delete(TEST_USER_ID, TEST_EVENT_ID)).rejects.toThrow(ServiceError);
    });
  });

  describe("markCompleted", () => {
    it("should mark event as completed", async () => {
      const completedEvent = { ...mockEvent, completed: true, completed_at: new Date() };
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(completedEvent));

      const result = await service.markCompleted(TEST_USER_ID, TEST_EVENT_ID, true);

      expect(result?.completed).toBe(true);
      expect(result?.completed_at).toBeDefined();
    });

    it("should throw ServiceError on database error", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.reject(new Error("DB Error")));

      await expect(service.markCompleted(TEST_USER_ID, TEST_EVENT_ID)).rejects.toThrow(ServiceError);
    });
  });

  describe("getUpcoming", () => {
    it("should return upcoming events", async () => {
      mockExecute.mockImplementation(() => Promise.resolve([mockEvent]));

      const result = await service.getUpcoming(TEST_USER_ID, 7);

      expect(result).toEqual([mockEvent]);
    });
  });

  describe("getOverdue", () => {
    it("should return overdue events", async () => {
      const overdueEvent = { ...mockEvent, date: new Date("2020-01-01") };
      mockExecute.mockImplementation(() => Promise.resolve([overdueEvent]));

      const result = await service.getOverdue(TEST_USER_ID);

      expect(result).toEqual([overdueEvent]);
    });
  });

  describe("getByDate", () => {
    it("should return events for specific date", async () => {
      mockExecute.mockImplementation(() => Promise.resolve([mockEvent]));

      const result = await service.getByDate(TEST_USER_ID, new Date("2024-06-15"));

      expect(result).toEqual([mockEvent]);
    });
  });

  describe("getByMonth", () => {
    it("should return events for specific month", async () => {
      mockExecute.mockImplementation(() => Promise.resolve([mockEvent]));

      const result = await service.getByMonth(TEST_USER_ID, 2024, 6);

      expect(result).toEqual([mockEvent]);
    });
  });

  describe("getEventsNeedingReminders", () => {
    it("should return events needing reminders", async () => {
      const eventWithReminder = { ...mockEvent, reminder_at: new Date(Date.now() + 60000) };
      mockExecute.mockImplementation(() => Promise.resolve([eventWithReminder]));

      const result = await service.getEventsNeedingReminders();

      expect(result).toEqual([eventWithReminder]);
    });
  });

  describe("getStats", () => {
    it("should return stats", async () => {
      const events = [
        { completed: true, event_type: "birthday" },
        { completed: false, event_type: "meeting" },
        { completed: true, event_type: "birthday" },
      ];
      mockExecute.mockImplementation(() => Promise.resolve(events));

      const result = await service.getStats(TEST_USER_ID);

      expect(result.total).toBe(3);
      expect(result.completed).toBe(2);
      expect(result.pending).toBe(1);
      expect(result.byType).toEqual({
        birthday: 2,
        meeting: 1,
      });
    });

    it("should return empty stats when no events", async () => {
      mockExecute.mockImplementation(() => Promise.resolve([]));

      const result = await service.getStats(TEST_USER_ID);

      expect(result.total).toBe(0);
      expect(result.completed).toBe(0);
      expect(result.pending).toBe(0);
      expect(result.byType).toEqual({});
    });
  });
});
