import { describe, expect, it, beforeEach, mock } from "bun:test";
import { Elysia } from "elysia";

// Test data
const TEST_USER_ID = "550e8400-e29b-41d4-a716-446655440000";
const TEST_MEMORY_ID = "660e8400-e29b-41d4-a716-446655440001";

const mockMemory = {
  id: TEST_MEMORY_ID,
  user_id: TEST_USER_ID,
  person_id: "person-123",
  title: "Trip to Paris",
  description: "Amazing weekend",
  date: new Date("2024-06-15").toISOString(),
  media_urls: ["https://example.com/photo.jpg"],
  tags: ["travel", "france"],
  location: "Paris, France",
  is_favorite: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// Mock service
const mockMemoriesService = {
  getAll: mock((_userId: string, _filters?: any) => Promise.resolve([mockMemory])),
  getById: mock((_userId: string, _memoryId: string) => Promise.resolve(mockMemory as typeof mockMemory | undefined)),
  create: mock((_data: any) => Promise.resolve(mockMemory)),
  update: mock((_userId: string, _memoryId: string, _data: any) => Promise.resolve(mockMemory as typeof mockMemory | undefined)),
  delete: mock((_userId: string, _memoryId: string) => Promise.resolve(true)),
  uploadMedia: mock((_userId: string, _memoryId: string, _file: File) => Promise.resolve("https://example.com/new.jpg")),
  removeMedia: mock((_userId: string, _memoryId: string, _url: string) => Promise.resolve(true)),
  toggleFavorite: mock((_userId: string, _memoryId: string) => Promise.resolve({ ...mockMemory, is_favorite: true })),
  getAllTags: mock((_userId: string) => Promise.resolve(["tag1", "tag2"])),
  getFavorites: mock((_userId: string) => Promise.resolve([mockMemory])),
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

// Create test app
function createTestApp() {
  return new Elysia({ prefix: "/memories" })
    .derive(() => ({
      user: { id: TEST_USER_ID, email: "test@example.com", name: "Test User", avatar_url: null },
    }))
    .get("/", async ({ user, query, set }) => {
      try {
        const memories = await mockMemoriesService.getAll(user.id, {
          personId: query.person_id,
          startDate: query.start_date ? new Date(query.start_date) : undefined,
          endDate: query.end_date ? new Date(query.end_date) : undefined,
          tags: query.tags?.split(",").filter(Boolean),
          isFavorite: query.favorites ? query.favorites === "true" : undefined,
        });
        return { success: true, data: memories };
      } catch (error) {
        set.status = 500;
        return { success: false, error: "Internal server error" };
      }
    })
    .get("/favorites", async ({ user, set }) => {
      try {
        const memories = await mockMemoriesService.getFavorites(user.id);
        return { success: true, data: memories };
      } catch (error) {
        set.status = 500;
        return { success: false, error: "Internal server error" };
      }
    })
    .get("/tags", async ({ user, set }) => {
      try {
        const tags = await mockMemoriesService.getAllTags(user.id);
        return { success: true, data: tags };
      } catch (error) {
        set.status = 500;
        return { success: false, error: "Internal server error" };
      }
    })
    .get("/:id", async ({ user, params, set }) => {
      try {
        const memory = await mockMemoriesService.getById(user.id, params.id);
        if (!memory) {
          set.status = 404;
          return { success: false, error: "Memory not found" };
        }
        return { success: true, data: memory };
      } catch (error) {
        set.status = 500;
        return { success: false, error: "Internal server error" };
      }
    })
    .post("/", async ({ user, body, set }) => {
      try {
        const reqBody = body as any;
        const memory = await mockMemoriesService.create({
          user_id: user.id,
          person_id: reqBody.person_id,
          title: reqBody.title,
          description: reqBody.description,
          date: reqBody.date ? new Date(reqBody.date) : null,
          media_urls: reqBody.media_urls,
          tags: reqBody.tags,
          location: reqBody.location,
          is_favorite: reqBody.is_favorite || false,
        });
        set.status = 201;
        return { success: true, data: memory };
      } catch (error) {
        set.status = 500;
        return { success: false, error: "Internal server error" };
      }
    })
    .patch("/:id", async ({ user, params, body, set }) => {
      try {
        const reqBody = body as any;
        const memory = await mockMemoriesService.update(user.id, params.id, {
          person_id: reqBody.person_id,
          title: reqBody.title,
          description: reqBody.description,
          date: reqBody.date ? new Date(reqBody.date) : undefined,
          media_urls: reqBody.media_urls,
          tags: reqBody.tags,
          location: reqBody.location,
          is_favorite: reqBody.is_favorite,
        });
        if (!memory) {
          set.status = 404;
          return { success: false, error: "Memory not found" };
        }
        return { success: true, data: memory };
      } catch (error) {
        set.status = 500;
        return { success: false, error: "Internal server error" };
      }
    })
    .post("/:id/favorite", async ({ user, params, set }) => {
      try {
        const memory = await mockMemoriesService.toggleFavorite(user.id, params.id);
        if (!memory) {
          set.status = 404;
          return { success: false, error: "Memory not found" };
        }
        return { success: true, data: memory };
      } catch (error) {
        set.status = 500;
        return { success: false, error: "Internal server error" };
      }
    })
    .post("/:id/media", async ({ user, params, body, set }) => {
      try {
        const reqBody = body as any;
        const file = reqBody.file;
        if (!file) {
          set.status = 400;
          return { success: false, error: "No file provided" };
        }

        const url = await mockMemoriesService.uploadMedia(user.id, params.id, file);
        if (!url) {
          set.status = 404;
          return { success: false, error: "Memory not found or upload failed" };
        }

        return { success: true, data: { url } };
      } catch (error) {
        set.status = 500;
        return { success: false, error: "Internal server error" };
      }
    })
    .delete("/:id/media", async ({ user, params, body, set }) => {
      try {
        const reqBody = body as any;
        const success = await mockMemoriesService.removeMedia(user.id, params.id, reqBody.url);
        if (!success) {
          set.status = 404;
          return { success: false, error: "Memory not found" };
        }
        return { success: true };
      } catch (error) {
        set.status = 500;
        return { success: false, error: "Internal server error" };
      }
    })
    .delete("/:id", async ({ user, params, set }) => {
      try {
        const deleted = await mockMemoriesService.delete(user.id, params.id);
        if (!deleted) {
          set.status = 404;
          return { success: false, error: "Memory not found" };
        }
        set.status = 204;
        return null;
      } catch (error) {
        set.status = 500;
        return { success: false, error: "Internal server error" };
      }
    });
}

describe("Memories Routes", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
    mockMemoriesService.getAll.mockClear();
    mockMemoriesService.getById.mockClear();
    mockMemoriesService.create.mockClear();
    mockMemoriesService.update.mockClear();
    mockMemoriesService.delete.mockClear();
    mockMemoriesService.uploadMedia.mockClear();
    mockMemoriesService.removeMedia.mockClear();
    mockMemoriesService.toggleFavorite.mockClear();
    mockMemoriesService.getAllTags.mockClear();
    mockMemoriesService.getFavorites.mockClear();

    // Default implementations
    mockMemoriesService.getAll.mockImplementation(() => Promise.resolve([mockMemory]));
    mockMemoriesService.getById.mockImplementation(() => Promise.resolve(mockMemory));
    mockMemoriesService.create.mockImplementation(() => Promise.resolve(mockMemory));
    mockMemoriesService.update.mockImplementation(() => Promise.resolve(mockMemory));
    mockMemoriesService.delete.mockImplementation(() => Promise.resolve(true));
    mockMemoriesService.uploadMedia.mockImplementation(() => Promise.resolve("https://example.com/new.jpg"));
    mockMemoriesService.removeMedia.mockImplementation(() => Promise.resolve(true));
    mockMemoriesService.toggleFavorite.mockImplementation(() => Promise.resolve({ ...mockMemory, is_favorite: true }));
    mockMemoriesService.getAllTags.mockImplementation(() => Promise.resolve(["tag1", "tag2"]));
    mockMemoriesService.getFavorites.mockImplementation(() => Promise.resolve([mockMemory]));
  });

  describe("GET /memories", () => {
    it("should return all memories", async () => {
      const response = await app.handle(new Request("http://localhost/memories"));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual([mockMemory]);
    });

    it("should filter by filters", async () => {
      const response = await app.handle(new Request("http://localhost/memories?favorites=true&tags=tag1"));
      
      expect(response.status).toBe(200);
      expect(mockMemoriesService.getAll).toHaveBeenCalledWith(TEST_USER_ID, expect.objectContaining({ isFavorite: true, tags: ["tag1"] }));
    });
  });

  describe("GET /memories/favorites", () => {
    it("should return favorite memories", async () => {
      const response = await app.handle(new Request("http://localhost/memories/favorites"));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toEqual([mockMemory]);
    });
  });

  describe("GET /memories/tags", () => {
    it("should return tags", async () => {
      const response = await app.handle(new Request("http://localhost/memories/tags"));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toEqual(["tag1", "tag2"]);
    });
  });

  describe("GET /memories/:id", () => {
    it("should return memory", async () => {
      const response = await app.handle(new Request(`http://localhost/memories/${TEST_MEMORY_ID}`));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toEqual(mockMemory);
    });

    it("should return 404 when not found", async () => {
      mockMemoriesService.getById.mockImplementation(() => Promise.resolve(undefined));
      const response = await app.handle(new Request(`http://localhost/memories/${TEST_MEMORY_ID}`));
      expect(response.status).toBe(404);
    });
  });

  describe("POST /memories", () => {
    const validBody = {
      title: "New Memory",
      date: "2024-06-15",
    };

    it("should create memory", async () => {
      const response = await app.handle(
        new Request("http://localhost/memories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validBody),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
    });
  });

  describe("PATCH /memories/:id", () => {
    it("should update memory", async () => {
      const response = await app.handle(
        new Request(`http://localhost/memories/${TEST_MEMORY_ID}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Updated" }),
        })
      );
      
      expect(response.status).toBe(200);
    });

    it("should return 404 when not found", async () => {
      mockMemoriesService.update.mockImplementation(() => Promise.resolve(undefined));
      const response = await app.handle(
        new Request(`http://localhost/memories/${TEST_MEMORY_ID}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Updated" }),
        })
      );
      expect(response.status).toBe(404);
    });
  });

  describe("POST /memories/:id/favorite", () => {
    it("should toggle favorite", async () => {
      const response = await app.handle(
        new Request(`http://localhost/memories/${TEST_MEMORY_ID}/favorite`, {
          method: "POST",
        })
      );
      
      expect(response.status).toBe(200);
    });
  });

  describe("DELETE /memories/:id", () => {
    it("should delete memory", async () => {
      const response = await app.handle(
        new Request(`http://localhost/memories/${TEST_MEMORY_ID}`, {
          method: "DELETE",
        })
      );
      
      expect(response.status).toBe(204);
    });

    it("should return 404 when not found", async () => {
      mockMemoriesService.delete.mockImplementation(() => Promise.resolve(false));
      const response = await app.handle(
        new Request(`http://localhost/memories/${TEST_MEMORY_ID}`, {
          method: "DELETE",
        })
      );
      expect(response.status).toBe(404);
    });
  });
});
