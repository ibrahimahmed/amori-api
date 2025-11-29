// Environment variables are set in tests/setup.ts (preloaded by bun)
import { describe, expect, it, beforeEach, mock } from "bun:test";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Mock Redis - use 'any' for flexibility in tests
const mockRedisGet = mock((): Promise<any> => Promise.resolve(null));
const mockRedisSetex = mock((): Promise<any> => Promise.resolve("OK"));
const mockRedisKeys = mock((): Promise<any> => Promise.resolve([]));
const mockRedisDel = mock((): Promise<any> => Promise.resolve(1));

// Mock DB chain methods - use 'any' for flexibility in tests  
const mockExecute = mock((): Promise<any> => Promise.resolve([]));
const mockExecuteTakeFirst = mock((): Promise<any> => Promise.resolve(null));

// Mock SQL execute
const mockSqlExecute = mock((): Promise<any> => Promise.resolve({ rows: [] }));

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

// Mock SQL template
const mockSql = () => ({ execute: mockSqlExecute });

// Mock logger
const mockLogger = {
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {},
};

// Setup module mocks
mock.module("../../../src/libs/cache", () => ({
  redis: {
    get: mockRedisGet,
    setex: mockRedisSetex,
    keys: mockRedisKeys,
    del: mockRedisDel,
  },
}));

mock.module("../../../src/libs/db/client", () => ({
  db: mockDbChain,
}));

mock.module("kysely", () => ({
  sql: mockSql,
}));

mock.module("../../../src/libs/logger", () => ({
  logger: mockLogger,
}));

// Import after mocks are set up
import { PeopleService, ServiceError } from "../../../src/modules/people/people.service";

// Test data
const TEST_USER_ID = "user-123-456-789";
const TEST_PERSON_ID = "person-123-456-789";

const mockPerson = {
  id: TEST_PERSON_ID,
  user_id: TEST_USER_ID,
  name: "John Doe",
  relation_type: "friend" as const,
  birthday: new Date("1990-06-15"),
  anniversary: new Date("2020-02-14"),
  notes: "Test notes",
  person_notes: ["First note", "Second note"],
  avatar_url: null,
  phone: "+1234567890",
  email: "john@example.com",
  created_at: new Date(),
  updated_at: new Date(),
};

const mockMemory = {
  id: "memory-123",
  user_id: TEST_USER_ID,
  person_id: TEST_PERSON_ID,
  title: "First Meeting",
  description: "Met at a coffee shop",
  date: new Date("2023-12-01"),
  media_urls: [],
  tags: ["memorable"],
  location: "Coffee Shop",
  is_favorite: true,
  created_at: new Date(),
  updated_at: new Date(),
};

const mockPlannerEvent = {
  id: "planner-123",
  user_id: TEST_USER_ID,
  person_id: TEST_PERSON_ID,
  event_type: "birthday" as const,
  title: "Birthday Party",
  description: "Surprise party",
  date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  reminder_at: null,
  location: "Home",
  notes: null,
  completed: false,
  completed_at: null,
  created_at: new Date(),
  updated_at: new Date(),
};

const mockWishlistItem = {
  id: "wishlist-123",
  user_id: TEST_USER_ID,
  person_id: TEST_PERSON_ID,
  title: "Watch",
  description: "Nice watch",
  price_range: "$100-200",
  url: "https://example.com/watch",
  image_url: null,
  priority: "high" as const,
  purchased: false,
  purchased_at: null,
  notes: null,
  created_at: new Date(),
  updated_at: new Date(),
};

// Helper to reset all mocks
function resetMocks() {
  mockRedisGet.mockReset();
  mockRedisSetex.mockReset();
  mockRedisKeys.mockReset();
  mockRedisDel.mockReset();
  mockExecute.mockReset();
  mockExecuteTakeFirst.mockReset();
  mockSqlExecute.mockReset();
  // Set defaults
  mockRedisGet.mockImplementation(() => Promise.resolve(null));
  mockRedisSetex.mockImplementation(() => Promise.resolve("OK"));
  mockRedisKeys.mockImplementation(() => Promise.resolve([]));
  mockRedisDel.mockImplementation(() => Promise.resolve(1));
  mockExecute.mockImplementation(() => Promise.resolve([]));
  mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(null));
  mockSqlExecute.mockImplementation(() => Promise.resolve({ rows: [] }));
}

describe("PeopleService", () => {
  let service: PeopleService;

  beforeEach(() => {
    service = new PeopleService();
    resetMocks();
  });

  describe("ServiceError", () => {
    it("should create error with correct properties", () => {
      const error = new ServiceError("Test error", "DATABASE", 500);
      expect(error.message).toBe("Test error");
      expect(error.code).toBe("DATABASE");
      expect(error.statusCode).toBe(500);
      expect(error.name).toBe("ServiceError");
    });

    it("should create error with default status code", () => {
      const error = new ServiceError("Test error", "NOT_FOUND");
      expect(error.statusCode).toBe(500);
    });

    it("should support all error codes", () => {
      const codes = ["NOT_FOUND", "VALIDATION", "DATABASE", "INTERNAL", "CACHE"] as const;
      codes.forEach((code) => {
        const error = new ServiceError("Test", code, 400);
        expect(error.code).toBe(code);
      });
    });
  });

  describe("getAll", () => {
    it("should return cached data when available", async () => {
      const cachedPeople = [mockPerson];
      mockRedisGet.mockImplementation(() => Promise.resolve(JSON.stringify(cachedPeople)));

      const result = await service.getAll(TEST_USER_ID);

      // JSON serialization converts dates to strings, so compare structure
      expect(result).toHaveLength(1);
      expect(result[0].id).toEqual(mockPerson.id);
      expect(result[0].name).toEqual(mockPerson.name);
      expect(mockRedisGet).toHaveBeenCalled();
    });

    it("should fetch from database when cache miss", async () => {
      mockExecute.mockImplementation(() => Promise.resolve([mockPerson]));

      const result = await service.getAll(TEST_USER_ID);

      expect(result).toEqual([mockPerson]);
      expect(mockRedisSetex).toHaveBeenCalled();
    });

    it("should not cache filtered results", async () => {
      mockExecute.mockImplementation(() => Promise.resolve([mockPerson]));

      await service.getAll(TEST_USER_ID, { relationType: "friend" });

      expect(mockRedisGet).not.toHaveBeenCalled();
      expect(mockRedisSetex).not.toHaveBeenCalled();
    });

    it("should throw ServiceError on database error", async () => {
      mockExecute.mockImplementation(() => Promise.reject(new Error("DB Error")));

      await expect(service.getAll(TEST_USER_ID)).rejects.toThrow(ServiceError);
    });

    it("should return empty array when no people found", async () => {
      mockExecute.mockImplementation(() => Promise.resolve([]));

      const result = await service.getAll(TEST_USER_ID);

      expect(result).toEqual([]);
    });
  });

  describe("getById", () => {
    it("should return person when found", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(mockPerson));

      const result = await service.getById(TEST_USER_ID, TEST_PERSON_ID);

      expect(result).toEqual(mockPerson);
    });

    it("should return undefined when person not found", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(undefined));

      const result = await service.getById(TEST_USER_ID, TEST_PERSON_ID);

      expect(result).toBeUndefined();
    });

    it("should throw ServiceError on database error", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.reject(new Error("DB Error")));

      await expect(service.getById(TEST_USER_ID, TEST_PERSON_ID)).rejects.toThrow(ServiceError);
    });
  });

  describe("create", () => {
    const createData = {
      user_id: TEST_USER_ID,
      name: "Jane Doe",
      relation_type: "partner" as const,
      birthday: new Date("1992-03-20"),
      anniversary: null,
      notes: null,
      person_notes: null,
      avatar_url: null,
      phone: null,
      email: null,
    };

    it("should create person and invalidate cache", async () => {
      const createdPerson = { ...mockPerson, ...createData, id: "new-person-id" };
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(createdPerson));

      const result = await service.create(createData);

      expect(result).toEqual(createdPerson);
      expect(mockRedisKeys).toHaveBeenCalled();
    });

    it("should throw ServiceError on database error", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.reject(new Error("DB Error")));

      await expect(service.create(createData)).rejects.toThrow(ServiceError);
    });

    it("should create person with all optional fields", async () => {
      const fullData = {
        ...createData,
        notes: "Some notes",
        person_notes: ["Note 1", "Note 2"],
        avatar_url: "https://example.com/avatar.jpg",
        phone: "+1234567890",
        email: "jane@example.com",
      };
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve({ ...mockPerson, ...fullData }));

      const result = await service.create(fullData);

      expect(result).toBeDefined();
    });

    it("should create person with person_notes array", async () => {
      const dataWithNotes = {
        ...createData,
        person_notes: ["First note", "Second note", "Third note"],
      };
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve({ ...mockPerson, ...dataWithNotes }));

      const result = await service.create(dataWithNotes);

      expect(result?.person_notes).toEqual(["First note", "Second note", "Third note"]);
    });

    it("should create person with empty person_notes array", async () => {
      const dataWithEmptyNotes = {
        ...createData,
        person_notes: [],
      };
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve({ ...mockPerson, person_notes: [] }));

      const result = await service.create(dataWithEmptyNotes);

      expect(result?.person_notes).toEqual([]);
    });
  });

  describe("update", () => {
    const updateData = { name: "Updated Name", notes: "Updated notes" };

    it("should update person and invalidate cache", async () => {
      const updatedPerson = { ...mockPerson, ...updateData };
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(updatedPerson));

      const result = await service.update(TEST_USER_ID, TEST_PERSON_ID, updateData);

      expect(result).toEqual(updatedPerson);
      expect(mockRedisKeys).toHaveBeenCalled();
    });

    it("should return undefined when person not found", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(undefined));

      const result = await service.update(TEST_USER_ID, "non-existent", updateData);

      expect(result).toBeUndefined();
    });

    it("should not invalidate cache when person not found", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(undefined));

      await service.update(TEST_USER_ID, "non-existent", updateData);

      expect(mockRedisKeys).not.toHaveBeenCalled();
    });

    it("should throw ServiceError on database error", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.reject(new Error("DB Error")));

      await expect(service.update(TEST_USER_ID, TEST_PERSON_ID, updateData)).rejects.toThrow(ServiceError);
    });
  });

  describe("delete", () => {
    it("should delete person and invalidate cache", async () => {
      mockSqlExecute.mockImplementation(() => Promise.resolve({ rows: [{ deleted_id: TEST_PERSON_ID }] }));

      const result = await service.delete(TEST_USER_ID, TEST_PERSON_ID);

      expect(result).toBe(true);
      expect(mockRedisKeys).toHaveBeenCalled();
    });

    it("should return false when person not found", async () => {
      mockSqlExecute.mockImplementation(() => Promise.resolve({ rows: [] }));

      const result = await service.delete(TEST_USER_ID, "non-existent");

      expect(result).toBe(false);
    });

    it("should return false when deleted_id is null", async () => {
      mockSqlExecute.mockImplementation(() => Promise.resolve({ rows: [{ deleted_id: null }] }));

      const result = await service.delete(TEST_USER_ID, TEST_PERSON_ID);

      expect(result).toBe(false);
    });

    it("should throw ServiceError on database error", async () => {
      mockSqlExecute.mockImplementation(() => Promise.reject(new Error("DB Error")));

      await expect(service.delete(TEST_USER_ID, TEST_PERSON_ID)).rejects.toThrow(ServiceError);
    });
  });

  describe("getUpcomingEvents", () => {
    it("should return cached data when available", async () => {
      const cachedEvents = {
        birthdays: [],
        anniversaries: [],
        upcomingMemories: [],
        upcomingPlans: [],
      };
      mockRedisGet.mockImplementation(() => Promise.resolve(JSON.stringify(cachedEvents)));

      const result = await service.getUpcomingEvents(TEST_USER_ID, 30);

      expect(result).toEqual(cachedEvents);
    });

    it("should fetch from database when cache miss", async () => {
      mockSqlExecute.mockImplementation(() =>
        Promise.resolve({
          rows: [{ people: [mockPerson], memories: [mockMemory], upcoming_plans: [mockPlannerEvent] }],
        })
      );

      const result = await service.getUpcomingEvents(TEST_USER_ID, 30);

      expect(result).toBeDefined();
      expect(result.upcomingPlans).toHaveLength(1);
      expect(mockRedisSetex).toHaveBeenCalled();
    });

    it("should handle empty results", async () => {
      mockSqlExecute.mockImplementation(() =>
        Promise.resolve({ rows: [{ people: [], memories: [], upcoming_plans: [] }] })
      );

      const result = await service.getUpcomingEvents(TEST_USER_ID, 30);

      expect(result.birthdays).toEqual([]);
      expect(result.anniversaries).toEqual([]);
      expect(result.upcomingMemories).toEqual([]);
      expect(result.upcomingPlans).toEqual([]);
    });

    it("should throw ServiceError on database error", async () => {
      mockSqlExecute.mockImplementation(() => Promise.reject(new Error("DB Error")));

      await expect(service.getUpcomingEvents(TEST_USER_ID, 30)).rejects.toThrow(ServiceError);
    });

    it("should handle null data from database", async () => {
      mockSqlExecute.mockImplementation(() =>
        Promise.resolve({ rows: [{ people: null, memories: null, upcoming_plans: null }] })
      );

      const result = await service.getUpcomingEvents(TEST_USER_ID, 30);

      expect(result.birthdays).toEqual([]);
    });
  });

  describe("getFullProfile", () => {
    it("should return cached profile when available", async () => {
      const cachedProfile = {
        person: mockPerson,
        memories: [mockMemory],
        upcomingPlans: [mockPlannerEvent],
        wishlist: [mockWishlistItem],
        daysUntilBirthday: 30,
        daysUntilAnniversary: { days: 60, years: 3 },
      };
      mockRedisGet.mockImplementation(() => Promise.resolve(JSON.stringify(cachedProfile)));

      const result = await service.getFullProfile(TEST_USER_ID, TEST_PERSON_ID);

      // JSON serialization converts dates to strings, so compare structure
      expect(result?.person.id).toEqual(mockPerson.id);
      expect(result?.person.name).toEqual(mockPerson.name);
      expect(result?.memories).toHaveLength(1);
      expect(result?.upcomingPlans).toHaveLength(1);
      expect(result?.wishlist).toHaveLength(1);
      expect(result?.daysUntilBirthday).toEqual(30);
    });

    it("should fetch from database when cache miss", async () => {
      mockSqlExecute.mockImplementation(() =>
        Promise.resolve({
          rows: [
            {
              person: mockPerson,
              memories: [mockMemory],
              upcoming_plans: [mockPlannerEvent],
              wishlist: [mockWishlistItem],
            },
          ],
        })
      );

      const result = await service.getFullProfile(TEST_USER_ID, TEST_PERSON_ID);

      expect(result).toBeDefined();
      expect(result?.person).toEqual(mockPerson);
      expect(mockRedisSetex).toHaveBeenCalled();
    });

    it("should return null when person not found", async () => {
      mockSqlExecute.mockImplementation(() =>
        Promise.resolve({ rows: [{ person: null, memories: [], upcoming_plans: [], wishlist: [] }] })
      );

      const result = await service.getFullProfile(TEST_USER_ID, "non-existent");

      expect(result).toBeNull();
    });

    it("should calculate days until birthday", async () => {
      const personWithBirthday = { ...mockPerson, birthday: new Date("1990-12-25") };
      mockSqlExecute.mockImplementation(() =>
        Promise.resolve({ rows: [{ person: personWithBirthday, memories: [], upcoming_plans: [], wishlist: [] }] })
      );

      const result = await service.getFullProfile(TEST_USER_ID, TEST_PERSON_ID);

      expect(result?.daysUntilBirthday).toBeDefined();
      expect(typeof result?.daysUntilBirthday).toBe("number");
    });

    it("should calculate days until anniversary", async () => {
      const personWithAnniversary = { ...mockPerson, anniversary: new Date("2020-02-14") };
      mockSqlExecute.mockImplementation(() =>
        Promise.resolve({ rows: [{ person: personWithAnniversary, memories: [], upcoming_plans: [], wishlist: [] }] })
      );

      const result = await service.getFullProfile(TEST_USER_ID, TEST_PERSON_ID);

      expect(result?.daysUntilAnniversary).toBeDefined();
      expect(result?.daysUntilAnniversary?.days).toBeDefined();
      expect(result?.daysUntilAnniversary?.years).toBeDefined();
    });

    it("should return null for birthday/anniversary when not set", async () => {
      const personWithoutDates = { ...mockPerson, birthday: null, anniversary: null };
      mockSqlExecute.mockImplementation(() =>
        Promise.resolve({ rows: [{ person: personWithoutDates, memories: [], upcoming_plans: [], wishlist: [] }] })
      );

      const result = await service.getFullProfile(TEST_USER_ID, TEST_PERSON_ID);

      expect(result?.daysUntilBirthday).toBeNull();
      expect(result?.daysUntilAnniversary).toBeNull();
    });

    it("should throw ServiceError on database error", async () => {
      mockSqlExecute.mockImplementation(() => Promise.reject(new Error("DB Error")));

      await expect(service.getFullProfile(TEST_USER_ID, TEST_PERSON_ID)).rejects.toThrow(ServiceError);
    });
  });

  describe("invalidateCache", () => {
    it("should invalidate all user cache", async () => {
      mockRedisKeys.mockImplementation(() =>
        Promise.resolve(["people:list:user-123", "people:profile:user-123:person-1"])
      );

      await service.invalidateCache(TEST_USER_ID);

      expect(mockRedisKeys).toHaveBeenCalled();
      expect(mockRedisDel).toHaveBeenCalled();
    });

    it("should handle empty cache gracefully", async () => {
      mockRedisKeys.mockImplementation(() => Promise.resolve([]));

      await service.invalidateCache(TEST_USER_ID);

      expect(mockRedisDel).not.toHaveBeenCalled();
    });
  });

  describe("Cache error handling", () => {
    it("should continue when cache read fails", async () => {
      mockRedisGet.mockImplementation(() => Promise.reject(new Error("Redis error")));
      mockExecute.mockImplementation(() => Promise.resolve([mockPerson]));

      const result = await service.getAll(TEST_USER_ID);

      expect(result).toEqual([mockPerson]);
    });

    it("should continue when cache write fails", async () => {
      mockRedisSetex.mockImplementation(() => Promise.reject(new Error("Redis error")));
      mockExecute.mockImplementation(() => Promise.resolve([mockPerson]));

      const result = await service.getAll(TEST_USER_ID);

      expect(result).toEqual([mockPerson]);
    });

    it("should continue when cache invalidation fails", async () => {
      mockRedisKeys.mockImplementation(() => Promise.reject(new Error("Redis error")));
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(mockPerson));

      const result = await service.create({
        user_id: TEST_USER_ID,
        name: "Test",
        relation_type: "friend",
      });

      expect(result).toBeDefined();
    });
  });

  describe("Edge cases", () => {
    it("should handle special characters in names", async () => {
      const specialNamePerson = { ...mockPerson, name: "José María O'Connor-Smith" };
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(specialNamePerson));

      const result = await service.create({
        user_id: TEST_USER_ID,
        name: "José María O'Connor-Smith",
        relation_type: "friend",
      });

      expect(result?.name).toBe("José María O'Connor-Smith");
    });

    it("should handle very long notes", async () => {
      const longNotes = "A".repeat(10000);
      const personWithLongNotes = { ...mockPerson, notes: longNotes };
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(personWithLongNotes));

      const result = await service.update(TEST_USER_ID, TEST_PERSON_ID, { notes: longNotes });

      expect(result?.notes?.length).toBe(10000);
    });

    it("should handle person_notes array updates", async () => {
      const newNotes = ["Updated note 1", "Updated note 2"];
      const personWithUpdatedNotes = { ...mockPerson, person_notes: newNotes };
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(personWithUpdatedNotes));

      const result = await service.update(TEST_USER_ID, TEST_PERSON_ID, { person_notes: newNotes });

      expect(result?.person_notes).toEqual(newNotes);
    });

    it("should handle large person_notes array", async () => {
      const manyNotes = Array(100).fill(null).map((_, i) => `Note ${i + 1}`);
      const personWithManyNotes = { ...mockPerson, person_notes: manyNotes };
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(personWithManyNotes));

      const result = await service.update(TEST_USER_ID, TEST_PERSON_ID, { person_notes: manyNotes });

      expect(result?.person_notes?.length).toBe(100);
    });

    it("should handle clearing person_notes with empty array", async () => {
      const personWithEmptyNotes = { ...mockPerson, person_notes: [] };
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(personWithEmptyNotes));

      const result = await service.update(TEST_USER_ID, TEST_PERSON_ID, { person_notes: [] });

      expect(result?.person_notes).toEqual([]);
    });

    it("should handle all relation types", async () => {
      const relationTypes = ["partner", "spouse", "parent", "child", "sibling", "friend", "colleague", "mentor", "other"] as const;

      for (const relationType of relationTypes) {
        mockExecuteTakeFirst.mockImplementation(() => Promise.resolve({ ...mockPerson, relation_type: relationType }));

        const result = await service.create({
          user_id: TEST_USER_ID,
          name: "Test Person",
          relation_type: relationType,
        });

        expect(result?.relation_type).toBe(relationType);
      }
    });

    it("should handle leap year birthdays", async () => {
      const leapYearBirthday = { ...mockPerson, birthday: new Date("2000-02-29") };
      mockSqlExecute.mockImplementation(() =>
        Promise.resolve({ rows: [{ person: leapYearBirthday, memories: [], upcoming_plans: [], wishlist: [] }] })
      );

      const result = await service.getFullProfile(TEST_USER_ID, TEST_PERSON_ID);

      expect(result?.daysUntilBirthday).toBeDefined();
    });

    it("should handle dates at year boundaries", async () => {
      const yearEndBirthday = { ...mockPerson, birthday: new Date("1990-12-31") };
      mockSqlExecute.mockImplementation(() =>
        Promise.resolve({ rows: [{ person: yearEndBirthday, memories: [], upcoming_plans: [], wishlist: [] }] })
      );

      const result = await service.getFullProfile(TEST_USER_ID, TEST_PERSON_ID);

      expect(result?.daysUntilBirthday).toBeDefined();
    });
  });
});
