import { describe, expect, it, beforeEach, mock } from "bun:test";
import { Elysia } from "elysia";

// Test data
const TEST_USER_ID = "550e8400-e29b-41d4-a716-446655440000";
const TEST_ITEM_ID = "660e8400-e29b-41d4-a716-446655440001";

const mockItem = {
  id: TEST_ITEM_ID,
  user_id: TEST_USER_ID,
  person_id: "person-123",
  title: "Test Gift",
  description: "A wonderful gift",
  price_range: "$50-100",
  url: "https://example.com/gift",
  image_url: "https://example.com/image.jpg",
  priority: "medium",
  purchased: false,
  purchased_at: null,
  notes: "Buy this",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// Mock service
const mockWishlistService = {
  getAll: mock((_userId: string, _filters?: any) => Promise.resolve([mockItem])),
  getById: mock((_userId: string, _itemId: string) => Promise.resolve(mockItem as typeof mockItem | undefined)),
  create: mock((_data: any) => Promise.resolve(mockItem)),
  update: mock((_userId: string, _itemId: string, _data: any) => Promise.resolve(mockItem as typeof mockItem | undefined)),
  delete: mock((_userId: string, _itemId: string) => Promise.resolve(true)),
  markPurchased: mock((_userId: string, _itemId: string, _purchased: boolean) => Promise.resolve({ ...mockItem, purchased: true })),
  getGroupedByPerson: mock((_userId: string) => Promise.resolve({ "person-123": [mockItem] })),
  getPurchaseHistory: mock((_userId: string) => Promise.resolve([mockItem])),
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
  return new Elysia({ prefix: "/wishlist" })
    .derive(() => ({
      user: { id: TEST_USER_ID, email: "test@example.com", name: "Test User", avatar_url: null },
    }))
    .get("/", async ({ user, query, set }) => {
      try {
        const items = await mockWishlistService.getAll(user.id, {
          personId: query.person_id,
          priority: query.priority,
          purchased: query.purchased !== undefined ? query.purchased === "true" : undefined,
        });
        return { success: true, data: items };
      } catch (error) {
        if (error instanceof MockServiceError) {
          set.status = error.statusCode;
          return { success: false, error: error.message };
        }
        set.status = 500;
        return { success: false, error: "Internal server error" };
      }
    })
    .get("/grouped", async ({ user, set }) => {
      try {
        const grouped = await mockWishlistService.getGroupedByPerson(user.id);
        return { success: true, data: grouped };
      } catch (error) {
        set.status = 500;
        return { success: false, error: "Internal server error" };
      }
    })
    .get("/history", async ({ user, set }) => {
      try {
        const items = await mockWishlistService.getPurchaseHistory(user.id);
        return { success: true, data: items };
      } catch (error) {
        set.status = 500;
        return { success: false, error: "Internal server error" };
      }
    })
    .get("/:id", async ({ user, params, set }) => {
      try {
        const item = await mockWishlistService.getById(user.id, params.id);
        if (!item) {
          set.status = 404;
          return { success: false, error: "Item not found" };
        }
        return { success: true, data: item };
      } catch (error) {
        set.status = 500;
        return { success: false, error: "Internal server error" };
      }
    })
    .post("/", async ({ user, body, set }) => {
      try {
        const reqBody = body as any;
        const item = await mockWishlistService.create({
          user_id: user.id,
          ...reqBody,
          priority: reqBody.priority || "medium",
        });
        set.status = 201;
        return { success: true, data: item };
      } catch (error) {
        set.status = 500;
        return { success: false, error: "Internal server error" };
      }
    })
    .patch("/:id", async ({ user, params, body, set }) => {
      try {
        const reqBody = body as any;
        const item = await mockWishlistService.update(user.id, params.id, reqBody);
        if (!item) {
          set.status = 404;
          return { success: false, error: "Item not found" };
        }
        return { success: true, data: item };
      } catch (error) {
        set.status = 500;
        return { success: false, error: "Internal server error" };
      }
    })
    .post("/:id/purchase", async ({ user, params, body, set }) => {
      try {
        const reqBody = body as any;
        const item = await mockWishlistService.markPurchased(user.id, params.id, reqBody.purchased ?? true);
        if (!item) {
          set.status = 404;
          return { success: false, error: "Item not found" };
        }
        return { success: true, data: item };
      } catch (error) {
        set.status = 500;
        return { success: false, error: "Internal server error" };
      }
    })
    .delete("/:id", async ({ user, params, set }) => {
      try {
        const deleted = await mockWishlistService.delete(user.id, params.id);
        if (!deleted) {
          set.status = 404;
          return { success: false, error: "Item not found" };
        }
        set.status = 204;
        return null;
      } catch (error) {
        set.status = 500;
        return { success: false, error: "Internal server error" };
      }
    });
}

describe("Wishlist Routes", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
    mockWishlistService.getAll.mockClear();
    mockWishlistService.getById.mockClear();
    mockWishlistService.create.mockClear();
    mockWishlistService.update.mockClear();
    mockWishlistService.delete.mockClear();
    mockWishlistService.markPurchased.mockClear();
    mockWishlistService.getGroupedByPerson.mockClear();
    mockWishlistService.getPurchaseHistory.mockClear();

    // Default implementations
    mockWishlistService.getAll.mockImplementation(() => Promise.resolve([mockItem]));
    mockWishlistService.getById.mockImplementation(() => Promise.resolve(mockItem));
    mockWishlistService.create.mockImplementation(() => Promise.resolve(mockItem));
    mockWishlistService.update.mockImplementation(() => Promise.resolve(mockItem));
    mockWishlistService.delete.mockImplementation(() => Promise.resolve(true));
    mockWishlistService.markPurchased.mockImplementation(() => Promise.resolve({ ...mockItem, purchased: true }));
    mockWishlistService.getGroupedByPerson.mockImplementation(() => Promise.resolve({ "person-123": [mockItem] }));
    mockWishlistService.getPurchaseHistory.mockImplementation(() => Promise.resolve([mockItem]));
  });

  describe("GET /wishlist", () => {
    it("should return all items", async () => {
      const response = await app.handle(new Request("http://localhost/wishlist"));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual([mockItem]);
    });

    it("should filter by person_id", async () => {
      const response = await app.handle(new Request("http://localhost/wishlist?person_id=123"));
      
      expect(response.status).toBe(200);
      expect(mockWishlistService.getAll).toHaveBeenCalledWith(TEST_USER_ID, expect.objectContaining({ personId: "123" }));
    });
  });

  describe("GET /wishlist/grouped", () => {
    it("should return grouped items", async () => {
      const response = await app.handle(new Request("http://localhost/wishlist/grouped"));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toEqual({ "person-123": [mockItem] });
    });
  });

  describe("GET /wishlist/history", () => {
    it("should return purchase history", async () => {
      const response = await app.handle(new Request("http://localhost/wishlist/history"));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toEqual([mockItem]);
    });
  });

  describe("GET /wishlist/:id", () => {
    it("should return item", async () => {
      const response = await app.handle(new Request(`http://localhost/wishlist/${TEST_ITEM_ID}`));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toEqual(mockItem);
    });

    it("should return 404 when not found", async () => {
      mockWishlistService.getById.mockImplementation(() => Promise.resolve(undefined));
      const response = await app.handle(new Request(`http://localhost/wishlist/${TEST_ITEM_ID}`));
      expect(response.status).toBe(404);
    });
  });

  describe("POST /wishlist", () => {
    const validBody = {
      title: "New Item",
      priority: "medium",
    };

    it("should create item", async () => {
      const response = await app.handle(
        new Request("http://localhost/wishlist", {
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

  describe("PATCH /wishlist/:id", () => {
    it("should update item", async () => {
      const response = await app.handle(
        new Request(`http://localhost/wishlist/${TEST_ITEM_ID}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Updated" }),
        })
      );
      
      expect(response.status).toBe(200);
    });

    it("should return 404 when not found", async () => {
      mockWishlistService.update.mockImplementation(() => Promise.resolve(undefined));
      const response = await app.handle(
        new Request(`http://localhost/wishlist/${TEST_ITEM_ID}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Updated" }),
        })
      );
      expect(response.status).toBe(404);
    });
  });

  describe("POST /wishlist/:id/purchase", () => {
    it("should mark as purchased", async () => {
      const response = await app.handle(
        new Request(`http://localhost/wishlist/${TEST_ITEM_ID}/purchase`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ purchased: true }),
        })
      );
      
      expect(response.status).toBe(200);
    });
  });

  describe("DELETE /wishlist/:id", () => {
    it("should delete item", async () => {
      const response = await app.handle(
        new Request(`http://localhost/wishlist/${TEST_ITEM_ID}`, {
          method: "DELETE",
        })
      );
      
      expect(response.status).toBe(204);
    });

    it("should return 404 when not found", async () => {
      mockWishlistService.delete.mockImplementation(() => Promise.resolve(false));
      const response = await app.handle(
        new Request(`http://localhost/wishlist/${TEST_ITEM_ID}`, {
          method: "DELETE",
        })
      );
      expect(response.status).toBe(404);
    });
  });
});
