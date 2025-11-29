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

// Mock Redis
const mockRedisGet = mock((): Promise<any> => Promise.resolve(null));
const mockRedisSetex = mock((): Promise<any> => Promise.resolve("OK"));
const mockRedisKeys = mock((): Promise<any> => Promise.resolve([]));
const mockRedisDel = mock((): Promise<any> => Promise.resolve(1));

// Setup module mocks
mock.module("../../../src/libs/db/client", () => ({
  db: mockDbChain,
}));

mock.module("../../../src/libs/logger", () => ({
  logger: mockLogger,
}));

mock.module("../../../src/libs/cache", () => ({
  redis: {
    get: mockRedisGet,
    setex: mockRedisSetex,
    keys: mockRedisKeys,
    del: mockRedisDel,
  },
}));

// Import after mocks are set up
import { WishlistService, ServiceError } from "../../../src/modules/wishlist/wishlist.service";

// Test data
const TEST_USER_ID = "user-123-456-789";
const TEST_ITEM_ID = "item-123-456-789";
const TEST_PERSON_ID = "person-123-456-789";

const mockItem = {
  id: TEST_ITEM_ID,
  user_id: TEST_USER_ID,
  person_id: TEST_PERSON_ID,
  title: "Test Gift",
  description: "A wonderful gift",
  price_range: "$50-100",
  url: "https://example.com/gift",
  image_url: "https://example.com/image.jpg",
  priority: "medium" as const,
  purchased: false,
  purchased_at: null,
  notes: "Buy this",
  created_at: new Date(),
  updated_at: new Date(),
};

// Helper to reset all mocks
function resetMocks() {
  mockExecute.mockReset();
  mockExecuteTakeFirst.mockReset();
  mockRedisGet.mockReset();
  mockRedisSetex.mockReset();
  mockRedisKeys.mockReset();
  mockRedisDel.mockReset();
  // Set defaults
  mockExecute.mockImplementation(() => Promise.resolve([]));
  mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(null));
  mockRedisGet.mockImplementation(() => Promise.resolve(null));
  mockRedisSetex.mockImplementation(() => Promise.resolve("OK"));
  mockRedisKeys.mockImplementation(() => Promise.resolve([]));
  mockRedisDel.mockImplementation(() => Promise.resolve(1));
}

describe("WishlistService", () => {
  let service: WishlistService;

  beforeEach(() => {
    service = new WishlistService();
    resetMocks();
  });

  describe("getAll", () => {
    it("should return items", async () => {
      mockExecute.mockImplementation(() => Promise.resolve([mockItem]));

      const result = await service.getAll(TEST_USER_ID);

      expect(result).toEqual([mockItem]);
    });

    it("should apply filters correctly", async () => {
      mockExecute.mockImplementation(() => Promise.resolve([mockItem]));

      await service.getAll(TEST_USER_ID, {
        personId: TEST_PERSON_ID,
        priority: "high",
        purchased: false,
      });

      expect(mockExecute).toHaveBeenCalled();
    });

    it("should throw ServiceError on database error", async () => {
      mockExecute.mockImplementation(() => Promise.reject(new Error("DB Error")));

      await expect(service.getAll(TEST_USER_ID)).rejects.toThrow(ServiceError);
    });
  });

  describe("getById", () => {
    it("should return item when found", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(mockItem));

      const result = await service.getById(TEST_USER_ID, TEST_ITEM_ID);

      expect(result).toEqual(mockItem);
    });

    it("should return undefined when item not found", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(undefined));

      const result = await service.getById(TEST_USER_ID, TEST_ITEM_ID);

      expect(result).toBeUndefined();
    });

    it("should throw ServiceError on database error", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.reject(new Error("DB Error")));

      await expect(service.getById(TEST_USER_ID, TEST_ITEM_ID)).rejects.toThrow(ServiceError);
    });
  });

  describe("create", () => {
    const createData = {
      user_id: TEST_USER_ID,
      title: "New Item",
      person_id: null,
      description: null,
      price_range: null,
      url: null,
      image_url: null,
      priority: "medium" as const,
      purchased: false,
      notes: null,
    };

    it("should create item", async () => {
      const createdItem = { ...mockItem, ...createData, id: "new-item-id" };
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(createdItem));

      const result = await service.create(createData);

      expect(result).toEqual(createdItem);
    });

    it("should throw ServiceError on database error", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.reject(new Error("DB Error")));

      await expect(service.create(createData)).rejects.toThrow(ServiceError);
    });
  });

  describe("update", () => {
    const updateData = { title: "Updated Title" };

    it("should update item", async () => {
      const updatedItem = { ...mockItem, ...updateData };
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(updatedItem));

      const result = await service.update(TEST_USER_ID, TEST_ITEM_ID, updateData);

      expect(result).toEqual(updatedItem);
    });

    it("should throw ServiceError on database error", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.reject(new Error("DB Error")));

      await expect(service.update(TEST_USER_ID, TEST_ITEM_ID, updateData)).rejects.toThrow(ServiceError);
    });
  });

  describe("delete", () => {
    it("should delete item", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve({ numDeletedRows: 1n }));

      const result = await service.delete(TEST_USER_ID, TEST_ITEM_ID);

      expect(result).toBe(true);
    });

    it("should return false when nothing deleted", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve({ numDeletedRows: 0n }));

      const result = await service.delete(TEST_USER_ID, TEST_ITEM_ID);

      expect(result).toBe(false);
    });

    it("should throw ServiceError on database error", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.reject(new Error("DB Error")));

      await expect(service.delete(TEST_USER_ID, TEST_ITEM_ID)).rejects.toThrow(ServiceError);
    });
  });

  describe("markPurchased", () => {
    it("should mark item as purchased", async () => {
      const purchasedItem = { ...mockItem, purchased: true, purchased_at: new Date() };
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(purchasedItem));

      const result = await service.markPurchased(TEST_USER_ID, TEST_ITEM_ID, true);

      expect(result?.purchased).toBe(true);
      expect(result?.purchased_at).toBeDefined();
    });

    it("should throw ServiceError on database error", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.reject(new Error("DB Error")));

      await expect(service.markPurchased(TEST_USER_ID, TEST_ITEM_ID)).rejects.toThrow(ServiceError);
    });
  });

  describe("getGroupedByPerson", () => {
    it("should return items grouped by person", async () => {
      const itemWithPerson = { ...mockItem, person_id: "person-1" };
      const itemWithoutPerson = { ...mockItem, id: "item-2", person_id: null };
      
      mockExecute.mockImplementation(() => Promise.resolve([itemWithPerson, itemWithoutPerson]));

      const result = await service.getGroupedByPerson(TEST_USER_ID);

      expect(result["person-1"]).toHaveLength(1);
      expect(result["person-1"][0]).toEqual(itemWithPerson);
      expect(result.unassigned).toHaveLength(1);
      expect(result.unassigned[0]).toEqual(itemWithoutPerson);
    });

    it("should handle empty list", async () => {
      mockExecute.mockImplementation(() => Promise.resolve([]));

      const result = await service.getGroupedByPerson(TEST_USER_ID);

      expect(result).toEqual({ unassigned: [] });
    });
  });

  describe("getUnpurchasedForPerson", () => {
    it("should return unpurchased items for person", async () => {
      mockExecute.mockImplementation(() => Promise.resolve([mockItem]));

      const result = await service.getUnpurchasedForPerson(TEST_USER_ID, TEST_PERSON_ID);

      expect(result).toEqual([mockItem]);
    });
  });

  describe("getPurchaseHistory", () => {
    it("should return purchased items", async () => {
      const purchasedItem = { ...mockItem, purchased: true };
      mockExecute.mockImplementation(() => Promise.resolve([purchasedItem]));

      const result = await service.getPurchaseHistory(TEST_USER_ID);

      expect(result).toEqual([purchasedItem]);
    });
  });
});
