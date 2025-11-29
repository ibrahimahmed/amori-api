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

// Mock Supabase storage
const mockUploadFile = mock((): Promise<any> => Promise.resolve({ url: "https://example.com/file.jpg", error: null }));
const mockDeleteFile = mock((): Promise<any> => Promise.resolve({ data: {}, error: null }));

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

mock.module("../../../src/libs/supabase", () => ({
  uploadFile: mockUploadFile,
  deleteFile: mockDeleteFile,
  STORAGE_BUCKETS: { MEMORIES: "memories" },
}));

// Import after mocks are set up
import { MemoriesService, ServiceError } from "../../../src/modules/memories/memories.service";

// Test data
const TEST_USER_ID = "user-123-456-789";
const TEST_MEMORY_ID = "memory-123-456-789";

const mockMemory = {
  id: TEST_MEMORY_ID,
  user_id: TEST_USER_ID,
  person_id: "person-123",
  title: "Trip to Paris",
  description: "Amazing weekend",
  date: new Date("2024-06-15"),
  media_urls: ["https://project.supabase.co/storage/v1/object/public/memories/user-123/memory-123/photo1.jpg"],
  tags: ["travel", "france"],
  location: "Paris, France",
  is_favorite: false,
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
  mockUploadFile.mockReset();
  mockDeleteFile.mockReset();
  
  // Set defaults
  mockExecute.mockImplementation(() => Promise.resolve([]));
  mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(null));
  mockRedisGet.mockImplementation(() => Promise.resolve(null));
  mockRedisSetex.mockImplementation(() => Promise.resolve("OK"));
  mockRedisKeys.mockImplementation(() => Promise.resolve([]));
  mockRedisDel.mockImplementation(() => Promise.resolve(1));
  mockUploadFile.mockImplementation(() => Promise.resolve({ url: "https://example.com/file.jpg", error: null }));
  mockDeleteFile.mockImplementation(() => Promise.resolve({ data: {}, error: null }));
}

describe("MemoriesService", () => {
  let service: MemoriesService;

  beforeEach(() => {
    service = new MemoriesService();
    resetMocks();
  });

  describe("getAll", () => {
    it("should return memories", async () => {
      mockExecute.mockImplementation(() => Promise.resolve([mockMemory]));

      const result = await service.getAll(TEST_USER_ID);

      expect(result).toEqual([mockMemory]);
    });

    it("should apply filters correctly", async () => {
      mockExecute.mockImplementation(() => Promise.resolve([mockMemory]));

      await service.getAll(TEST_USER_ID, {
        personId: "person-123",
        tags: ["travel"],
        isFavorite: false,
      });

      expect(mockExecute).toHaveBeenCalled();
    });

    it("should filter by tags in memory", async () => {
      const memoryWithDifferentTags = { ...mockMemory, tags: ["other"] };
      mockExecute.mockImplementation(() => Promise.resolve([mockMemory, memoryWithDifferentTags]));

      const result = await service.getAll(TEST_USER_ID, {
        tags: ["travel"],
      });

      expect(result).toEqual([mockMemory]);
    });

    it("should throw ServiceError on database error", async () => {
      mockExecute.mockImplementation(() => Promise.reject(new Error("DB Error")));

      await expect(service.getAll(TEST_USER_ID)).rejects.toThrow(ServiceError);
    });
  });

  describe("getById", () => {
    it("should return memory when found", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(mockMemory));

      const result = await service.getById(TEST_USER_ID, TEST_MEMORY_ID);

      expect(result).toEqual(mockMemory);
    });

    it("should return undefined when memory not found", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(undefined));

      const result = await service.getById(TEST_USER_ID, TEST_MEMORY_ID);

      expect(result).toBeUndefined();
    });

    it("should throw ServiceError on database error", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.reject(new Error("DB Error")));

      await expect(service.getById(TEST_USER_ID, TEST_MEMORY_ID)).rejects.toThrow(ServiceError);
    });
  });

  describe("create", () => {
    const createData = {
      user_id: TEST_USER_ID,
      title: "New Memory",
      date: new Date(),
      person_id: null,
      description: null,
      media_urls: [],
      tags: [],
      location: null,
      is_favorite: false,
    };

    it("should create memory", async () => {
      const createdMemory = { ...mockMemory, ...createData, id: "new-memory-id" };
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(createdMemory));

      const result = await service.create(createData);

      expect(result).toEqual(createdMemory);
    });

    it("should throw ServiceError on database error", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.reject(new Error("DB Error")));

      await expect(service.create(createData)).rejects.toThrow(ServiceError);
    });
  });

  describe("update", () => {
    const updateData = { title: "Updated Title" };

    it("should update memory", async () => {
      const updatedMemory = { ...mockMemory, ...updateData };
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(updatedMemory));

      const result = await service.update(TEST_USER_ID, TEST_MEMORY_ID, updateData);

      expect(result).toEqual(updatedMemory);
    });

    it("should throw ServiceError on database error", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.reject(new Error("DB Error")));

      await expect(service.update(TEST_USER_ID, TEST_MEMORY_ID, updateData)).rejects.toThrow(ServiceError);
    });
  });

  describe("delete", () => {
    it("should delete memory and associated files", async () => {
      mockExecuteTakeFirst
        .mockImplementationOnce(() => Promise.resolve(mockMemory)) // getById
        .mockImplementationOnce(() => Promise.resolve({ numDeletedRows: 1n })); // deleteFrom

      const result = await service.delete(TEST_USER_ID, TEST_MEMORY_ID);

      expect(result).toBe(true);
      expect(mockDeleteFile).toHaveBeenCalled();
    });

    it("should return false when nothing deleted", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(undefined)); // getById -> not found

      const result = await service.delete(TEST_USER_ID, TEST_MEMORY_ID);

      expect(result).toBe(false);
    });

    it("should throw ServiceError on database error", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.reject(new Error("DB Error")));

      await expect(service.delete(TEST_USER_ID, TEST_MEMORY_ID)).rejects.toThrow(ServiceError);
    });
  });

  describe("uploadMedia", () => {
    const mockFile = new File(["content"], "test.jpg", { type: "image/jpeg" });

    it("should upload media and update memory", async () => {
      mockExecuteTakeFirst
        .mockImplementationOnce(() => Promise.resolve(mockMemory)) // getById
        .mockImplementationOnce(() => Promise.resolve({ ...mockMemory, media_urls: [...mockMemory.media_urls, "new-url"] })); // update

      const result = await service.uploadMedia(TEST_USER_ID, TEST_MEMORY_ID, mockFile);

      expect(result).toBe("https://example.com/file.jpg");
      expect(mockUploadFile).toHaveBeenCalled();
    });

    it("should return null if memory not found", async () => {
      mockExecuteTakeFirst.mockImplementation(() => Promise.resolve(undefined));

      const result = await service.uploadMedia(TEST_USER_ID, TEST_MEMORY_ID, mockFile);

      expect(result).toBeNull();
      expect(mockUploadFile).not.toHaveBeenCalled();
    });
  });

  describe("removeMedia", () => {
    const mediaUrl = "https://example.com/storage/v1/object/public/bucket/path/to/file.jpg";

    it("should remove media and update memory", async () => {
      mockExecuteTakeFirst
        .mockImplementationOnce(() => Promise.resolve({ ...mockMemory, media_urls: [mediaUrl] })) // getById
        .mockImplementationOnce(() => Promise.resolve({ ...mockMemory, media_urls: [] })); // update

      const result = await service.removeMedia(TEST_USER_ID, TEST_MEMORY_ID, mediaUrl);

      expect(result).toBe(true);
      expect(mockDeleteFile).toHaveBeenCalled();
    });
  });

  describe("toggleFavorite", () => {
    it("should toggle favorite status", async () => {
      mockExecuteTakeFirst
        .mockImplementationOnce(() => Promise.resolve(mockMemory)) // getById
        .mockImplementationOnce(() => Promise.resolve({ ...mockMemory, is_favorite: true })); // update

      const result = await service.toggleFavorite(TEST_USER_ID, TEST_MEMORY_ID);

      expect(result?.is_favorite).toBe(true);
    });
  });

  describe("getAllTags", () => {
    it("should return unique tags", async () => {
      const memories = [
        { tags: ["a", "b"] },
        { tags: ["b", "c"] },
        { tags: null },
      ];
      mockExecute.mockImplementation(() => Promise.resolve(memories));

      const result = await service.getAllTags(TEST_USER_ID);

      expect(result).toEqual(["a", "b", "c"]);
    });
  });

  describe("getFavorites", () => {
    it("should return favorite memories", async () => {
      mockExecute.mockImplementation(() => Promise.resolve([mockMemory]));

      const result = await service.getFavorites(TEST_USER_ID);

      expect(result).toEqual([mockMemory]);
    });
  });
});
