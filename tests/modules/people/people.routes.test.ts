import { describe, expect, it, beforeEach, mock, afterAll } from "bun:test";
import { Elysia } from "elysia";

// Test data
const TEST_USER_ID = "550e8400-e29b-41d4-a716-446655440000";
const TEST_PERSON_ID = "660e8400-e29b-41d4-a716-446655440001";

const mockPerson = {
  id: TEST_PERSON_ID,
  user_id: TEST_USER_ID,
  name: "John Doe",
  relation_type: "friend",
  birthday: "1990-06-15",
  anniversary: "2020-02-14",
  notes: "Test notes",
  avatar_url: null,
  phone: "+1234567890",
  email: "john@example.com",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const mockProfile = {
  person: mockPerson,
  memories: [],
  upcomingPlans: [],
  wishlist: [],
  daysUntilBirthday: 30,
  daysUntilAnniversary: { days: 60, years: 3 },
};

const mockUpcomingEvents = {
  birthdays: [{ person: mockPerson, daysUntil: 10 }],
  anniversaries: [{ person: mockPerson, daysUntil: 20, years: 3 }],
  upcomingMemories: [],
  upcomingPlans: [],
};

// Mock service with proper typing
const mockPeopleService = {
  getAll: mock((_userId: string, _filters?: { relationType?: string }) => Promise.resolve([mockPerson] as typeof mockPerson[])),
  getById: mock((_userId: string, _personId: string) => Promise.resolve(mockPerson as typeof mockPerson | undefined)),
  create: mock((_data: Record<string, unknown>) => Promise.resolve(mockPerson as typeof mockPerson | undefined)),
  update: mock((_userId: string, _personId: string, _data: Record<string, unknown>) => Promise.resolve(mockPerson as typeof mockPerson | null)),
  delete: mock((_userId: string, _personId: string) => Promise.resolve(true as boolean)),
  getUpcomingEvents: mock((_userId: string, _days: number) => Promise.resolve(mockUpcomingEvents as typeof mockUpcomingEvents)),
  getFullProfile: mock((_userId: string, _personId: string) => Promise.resolve(mockProfile as typeof mockProfile | null)),
  invalidateCache: mock((_userId: string) => Promise.resolve()),
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

// Create test app with mocked dependencies
function createTestApp() {
  return new Elysia({ prefix: "/people" })
    .derive(() => ({
      user: { id: TEST_USER_ID, email: "test@example.com", name: "Test User", avatar_url: null },
    }))
    .get("/", async ({ user, query, set }) => {
      try {
        const RELATION_TYPES = ["partner", "spouse", "parent", "child", "sibling", "friend", "colleague", "mentor", "other"];
        if (query.relation_type && !RELATION_TYPES.includes(query.relation_type)) {
          set.status = 400;
          return { success: false, error: `Invalid relation_type. Must be one of: ${RELATION_TYPES.join(", ")}` };
        }
        const people = await mockPeopleService.getAll(user.id, {
          relationType: query.relation_type,
        });
        return { success: true, data: people };
      } catch (error) {
        if (error instanceof MockServiceError) {
          set.status = error.statusCode;
          return { success: false, error: error.message };
        }
        set.status = 500;
        return { success: false, error: "Internal server error" };
      }
    })
    .get("/upcoming", async ({ user, query, set }) => {
      try {
        const days = query.days ? parseInt(query.days) : 30;
        if (days < 1 || days > 365) {
          set.status = 400;
          return { success: false, error: "Days must be between 1 and 365" };
        }
        const events = await mockPeopleService.getUpcomingEvents(user.id, days);
        return { success: true, data: events };
      } catch (error) {
        if (error instanceof MockServiceError) {
          set.status = error.statusCode;
          return { success: false, error: error.message };
        }
        set.status = 500;
        return { success: false, error: "Internal server error" };
      }
    })
    .get("/:id", async ({ user, params, set }) => {
      try {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(params.id)) {
          set.status = 400;
          return { success: false, error: "Invalid person ID format" };
        }
        const profile = await mockPeopleService.getFullProfile(user.id, params.id);
        if (!profile) {
          set.status = 404;
          return { success: false, error: "Person not found" };
        }
        return { success: true, data: profile };
      } catch (error) {
        if (error instanceof MockServiceError) {
          set.status = error.statusCode;
          return { success: false, error: error.message };
        }
        set.status = 500;
        return { success: false, error: "Internal server error" };
      }
    })
    .post("/", async ({ user, body, set }) => {
      try {
        const RELATION_TYPES = ["partner", "spouse", "parent", "child", "sibling", "friend", "colleague", "mentor", "other"];
        const reqBody = body as { name?: string; relation_type?: string; birthday?: string; anniversary?: string; email?: string };
        if (!reqBody.name || reqBody.name.length < 1) {
          set.status = 400;
          return { success: false, error: "Name is required" };
        }
        if (!reqBody.relation_type || !RELATION_TYPES.includes(reqBody.relation_type)) {
          set.status = 400;
          return { success: false, error: `Invalid relation_type. Must be one of: ${RELATION_TYPES.join(", ")}` };
        }
        if (reqBody.birthday && isNaN(Date.parse(reqBody.birthday))) {
          set.status = 400;
          return { success: false, error: "Invalid birthday date format" };
        }
        if (reqBody.anniversary && isNaN(Date.parse(reqBody.anniversary))) {
          set.status = 400;
          return { success: false, error: "Invalid anniversary date format" };
        }
        if (reqBody.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reqBody.email)) {
          set.status = 400;
          return { success: false, error: "Invalid email format" };
        }
        const person = await mockPeopleService.create({
          user_id: user.id,
          ...reqBody,
        });
        set.status = 201;
        return { success: true, data: person, message: "Person created successfully" };
      } catch (error) {
        if (error instanceof MockServiceError) {
          set.status = error.statusCode;
          return { success: false, error: error.message };
        }
        set.status = 500;
        return { success: false, error: "Internal server error" };
      }
    })
    .patch("/:id", async ({ user, params, body, set }) => {
      try {
        const RELATION_TYPES = ["partner", "spouse", "parent", "child", "sibling", "friend", "colleague", "mentor", "other"];
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(params.id)) {
          set.status = 400;
          return { success: false, error: "Invalid person ID format" };
        }
        const reqBody = body as { name?: string; relation_type?: string; birthday?: string; anniversary?: string; email?: string };
        if (reqBody.relation_type && !RELATION_TYPES.includes(reqBody.relation_type)) {
          set.status = 400;
          return { success: false, error: `Invalid relation_type. Must be one of: ${RELATION_TYPES.join(", ")}` };
        }
        if (reqBody.birthday && isNaN(Date.parse(reqBody.birthday))) {
          set.status = 400;
          return { success: false, error: "Invalid birthday date format" };
        }
        if (reqBody.anniversary && isNaN(Date.parse(reqBody.anniversary))) {
          set.status = 400;
          return { success: false, error: "Invalid anniversary date format" };
        }
        const person = await mockPeopleService.update(user.id, params.id, reqBody);
        if (!person) {
          set.status = 404;
          return { success: false, error: "Person not found" };
        }
        return { success: true, data: person, message: "Person updated successfully" };
      } catch (error) {
        if (error instanceof MockServiceError) {
          set.status = error.statusCode;
          return { success: false, error: error.message };
        }
        set.status = 500;
        return { success: false, error: "Internal server error" };
      }
    })
    .delete("/:id", async ({ user, params, set }) => {
      try {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(params.id)) {
          set.status = 400;
          return { success: false, error: "Invalid person ID format" };
        }
        const deleted = await mockPeopleService.delete(user.id, params.id);
        if (!deleted) {
          set.status = 404;
          return { success: false, error: "Person not found" };
        }
        set.status = 204;
        return null;
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

describe("People Routes", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
    // Reset all mocks
    mockPeopleService.getAll.mockReset();
    mockPeopleService.getById.mockReset();
    mockPeopleService.create.mockReset();
    mockPeopleService.update.mockReset();
    mockPeopleService.delete.mockReset();
    mockPeopleService.getUpcomingEvents.mockReset();
    mockPeopleService.getFullProfile.mockReset();
    // Set default implementations
    mockPeopleService.getAll.mockImplementation(() => Promise.resolve([mockPerson]));
    mockPeopleService.getById.mockImplementation(() => Promise.resolve(mockPerson));
    mockPeopleService.create.mockImplementation(() => Promise.resolve(mockPerson));
    mockPeopleService.update.mockImplementation(() => Promise.resolve(mockPerson));
    mockPeopleService.delete.mockImplementation(() => Promise.resolve(true));
    mockPeopleService.getUpcomingEvents.mockImplementation(() => Promise.resolve(mockUpcomingEvents));
    mockPeopleService.getFullProfile.mockImplementation(() => Promise.resolve(mockProfile));
  });

  describe("GET /people", () => {
    it("should return all people", async () => {
      const response = await app.handle(new Request("http://localhost/people"));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual([mockPerson]);
    });

    it("should filter by relation_type", async () => {
      const response = await app.handle(new Request("http://localhost/people?relation_type=friend"));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockPeopleService.getAll).toHaveBeenCalledWith(TEST_USER_ID, { relationType: "friend" });
    });

    it("should return 400 for invalid relation_type", async () => {
      const response = await app.handle(new Request("http://localhost/people?relation_type=invalid"));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain("Invalid relation_type");
    });

    it("should return empty array when no people found", async () => {
      mockPeopleService.getAll.mockImplementation(() => Promise.resolve([]));

      const response = await app.handle(new Request("http://localhost/people"));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toEqual([]);
    });

    it("should handle service errors", async () => {
      mockPeopleService.getAll.mockImplementation(() => Promise.reject(new MockServiceError("Database error", "DATABASE", 500)));

      const response = await app.handle(new Request("http://localhost/people"));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
    });

    it("should accept all valid relation types", async () => {
      const relationTypes = ["partner", "spouse", "parent", "child", "sibling", "friend", "colleague", "mentor", "other"];

      for (const relationType of relationTypes) {
        const response = await app.handle(new Request(`http://localhost/people?relation_type=${relationType}`));
        expect(response.status).toBe(200);
      }
    });
  });

  describe("GET /people/upcoming", () => {
    it("should return upcoming events with default days", async () => {
      const response = await app.handle(new Request("http://localhost/people/upcoming"));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual(mockUpcomingEvents);
      expect(mockPeopleService.getUpcomingEvents).toHaveBeenCalledWith(TEST_USER_ID, 30);
    });

    it("should accept custom days parameter", async () => {
      const response = await app.handle(new Request("http://localhost/people/upcoming?days=60"));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(mockPeopleService.getUpcomingEvents).toHaveBeenCalledWith(TEST_USER_ID, 60);
    });

    it("should return 400 for days less than 1", async () => {
      const response = await app.handle(new Request("http://localhost/people/upcoming?days=0"));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it("should return 400 for days greater than 365", async () => {
      const response = await app.handle(new Request("http://localhost/people/upcoming?days=400"));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it("should handle service errors", async () => {
      mockPeopleService.getUpcomingEvents.mockImplementation(() => Promise.reject(new MockServiceError("Error", "DATABASE", 500)));

      const response = await app.handle(new Request("http://localhost/people/upcoming"));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
    });

    it("should return empty arrays when no events", async () => {
      mockPeopleService.getUpcomingEvents.mockImplementation(() =>
        Promise.resolve({
          birthdays: [],
          anniversaries: [],
          upcomingMemories: [],
          upcomingPlans: [],
        })
      );

      const response = await app.handle(new Request("http://localhost/people/upcoming"));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.birthdays).toEqual([]);
    });
  });

  describe("GET /people/:id", () => {
    it("should return person profile", async () => {
      const response = await app.handle(new Request(`http://localhost/people/${TEST_PERSON_ID}`));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual(mockProfile);
    });

    it("should return 400 for invalid UUID", async () => {
      const response = await app.handle(new Request("http://localhost/people/invalid-id"));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain("Invalid person ID");
    });

    it("should return 404 when person not found", async () => {
      mockPeopleService.getFullProfile.mockImplementation(() => Promise.resolve(null));

      const response = await app.handle(new Request(`http://localhost/people/${TEST_PERSON_ID}`));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe("Person not found");
    });

    it("should handle service errors", async () => {
      mockPeopleService.getFullProfile.mockImplementation(() => Promise.reject(new MockServiceError("Error", "DATABASE", 500)));

      const response = await app.handle(new Request(`http://localhost/people/${TEST_PERSON_ID}`));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
    });
  });

  describe("POST /people", () => {
    const validCreateBody = {
      name: "Jane Doe",
      relation_type: "partner",
      birthday: "1992-03-20",
      anniversary: "2021-06-15",
      email: "jane@example.com",
    };

    it("should create a person", async () => {
      const response = await app.handle(
        new Request("http://localhost/people", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validCreateBody),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.message).toBe("Person created successfully");
    });

    it("should return 400 when name is missing", async () => {
      const response = await app.handle(
        new Request("http://localhost/people", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ relation_type: "friend" }),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Name is required");
    });

    it("should return 400 when name is empty", async () => {
      const response = await app.handle(
        new Request("http://localhost/people", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "", relation_type: "friend" }),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(400);
    });

    it("should return 400 for invalid relation_type", async () => {
      const response = await app.handle(
        new Request("http://localhost/people", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Test", relation_type: "invalid" }),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Invalid relation_type");
    });

    it("should return 400 for invalid birthday format", async () => {
      const response = await app.handle(
        new Request("http://localhost/people", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Test", relation_type: "friend", birthday: "invalid-date" }),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Invalid birthday");
    });

    it("should return 400 for invalid anniversary format", async () => {
      const response = await app.handle(
        new Request("http://localhost/people", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Test", relation_type: "friend", anniversary: "not-a-date" }),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Invalid anniversary");
    });

    it("should return 400 for invalid email format", async () => {
      const response = await app.handle(
        new Request("http://localhost/people", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Test", relation_type: "friend", email: "invalid-email" }),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Invalid email");
    });

    it("should create person with minimal data", async () => {
      const response = await app.handle(
        new Request("http://localhost/people", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Test Person", relation_type: "other" }),
        })
      );

      expect(response.status).toBe(201);
    });

    it("should handle service errors", async () => {
      mockPeopleService.create.mockImplementation(() => Promise.reject(new MockServiceError("Error", "DATABASE", 500)));

      const response = await app.handle(
        new Request("http://localhost/people", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validCreateBody),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
    });

    it("should accept all valid relation types", async () => {
      const relationTypes = ["partner", "spouse", "parent", "child", "sibling", "friend", "colleague", "mentor", "other"];

      for (const relationType of relationTypes) {
        mockPeopleService.create.mockImplementation(() => Promise.resolve({ ...mockPerson, relation_type: relationType }));

        const response = await app.handle(
          new Request("http://localhost/people", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Test", relation_type: relationType }),
          })
        );

        expect(response.status).toBe(201);
      }
    });
  });

  describe("PATCH /people/:id", () => {
    const validUpdateBody = {
      name: "Updated Name",
      notes: "Updated notes",
    };

    it("should update a person", async () => {
      const response = await app.handle(
        new Request(`http://localhost/people/${TEST_PERSON_ID}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validUpdateBody),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe("Person updated successfully");
    });

    it("should return 400 for invalid UUID", async () => {
      const response = await app.handle(
        new Request("http://localhost/people/invalid-id", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validUpdateBody),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Invalid person ID");
    });

    it("should return 404 when person not found", async () => {
      mockPeopleService.update.mockImplementation(() => Promise.resolve(null));

      const response = await app.handle(
        new Request(`http://localhost/people/${TEST_PERSON_ID}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validUpdateBody),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe("Person not found");
    });

    it("should return 400 for invalid relation_type", async () => {
      const response = await app.handle(
        new Request(`http://localhost/people/${TEST_PERSON_ID}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ relation_type: "invalid" }),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Invalid relation_type");
    });

    it("should return 400 for invalid birthday format", async () => {
      const response = await app.handle(
        new Request(`http://localhost/people/${TEST_PERSON_ID}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ birthday: "invalid" }),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Invalid birthday");
    });

    it("should return 400 for invalid anniversary format", async () => {
      const response = await app.handle(
        new Request(`http://localhost/people/${TEST_PERSON_ID}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ anniversary: "not-valid" }),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Invalid anniversary");
    });

    it("should handle service errors", async () => {
      mockPeopleService.update.mockImplementation(() => Promise.reject(new MockServiceError("Error", "DATABASE", 500)));

      const response = await app.handle(
        new Request(`http://localhost/people/${TEST_PERSON_ID}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validUpdateBody),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
    });

    it("should allow partial updates", async () => {
      const response = await app.handle(
        new Request(`http://localhost/people/${TEST_PERSON_ID}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: "Only updating notes" }),
        })
      );

      expect(response.status).toBe(200);
    });

    it("should allow empty body for no-op update", async () => {
      const response = await app.handle(
        new Request(`http://localhost/people/${TEST_PERSON_ID}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
      );

      expect(response.status).toBe(200);
    });
  });

  describe("DELETE /people/:id", () => {
    it("should delete a person", async () => {
      const response = await app.handle(
        new Request(`http://localhost/people/${TEST_PERSON_ID}`, {
          method: "DELETE",
        })
      );

      expect(response.status).toBe(204);
    });

    it("should return 400 for invalid UUID", async () => {
      const response = await app.handle(
        new Request("http://localhost/people/invalid-id", {
          method: "DELETE",
        })
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Invalid person ID");
    });

    it("should return 404 when person not found", async () => {
      mockPeopleService.delete.mockImplementation(() => Promise.resolve(false));

      const response = await app.handle(
        new Request(`http://localhost/people/${TEST_PERSON_ID}`, {
          method: "DELETE",
        })
      );
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe("Person not found");
    });

    it("should handle service errors", async () => {
      mockPeopleService.delete.mockImplementation(() => Promise.reject(new MockServiceError("Error", "DATABASE", 500)));

      const response = await app.handle(
        new Request(`http://localhost/people/${TEST_PERSON_ID}`, {
          method: "DELETE",
        })
      );
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    it("should handle special characters in name", async () => {
      mockPeopleService.create.mockImplementation(() =>
        Promise.resolve({ ...mockPerson, name: "José María O'Connor-Smith" })
      );

      const response = await app.handle(
        new Request("http://localhost/people", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "José María O'Connor-Smith", relation_type: "friend" }),
        })
      );

      expect(response.status).toBe(201);
    });

    it("should handle unicode characters", async () => {
      mockPeopleService.create.mockImplementation(() => Promise.resolve({ ...mockPerson, name: "田中太郎 🎉" }));

      const response = await app.handle(
        new Request("http://localhost/people", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "田中太郎 🎉", relation_type: "friend" }),
        })
      );

      expect(response.status).toBe(201);
    });

    it("should handle very long names", async () => {
      const longName = "A".repeat(1000);
      mockPeopleService.create.mockImplementation(() => Promise.resolve({ ...mockPerson, name: longName }));

      const response = await app.handle(
        new Request("http://localhost/people", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: longName, relation_type: "friend" }),
        })
      );

      expect(response.status).toBe(201);
    });

    it("should handle leap year birthday", async () => {
      const response = await app.handle(
        new Request("http://localhost/people", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Leap Year Person", relation_type: "friend", birthday: "2000-02-29" }),
        })
      );

      expect(response.status).toBe(201);
    });

    it("should handle valid date at year boundary", async () => {
      const response = await app.handle(
        new Request("http://localhost/people", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Year End", relation_type: "friend", birthday: "1990-12-31" }),
        })
      );

      expect(response.status).toBe(201);
    });

    it("should handle concurrent requests", async () => {
      const requests = Array(10)
        .fill(null)
        .map(() =>
          app.handle(
            new Request("http://localhost/people", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: "Concurrent Test", relation_type: "friend" }),
            })
          )
        );

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.status).toBe(201);
      });
    });

    it("should handle different UUID formats", async () => {
      // lowercase
      let response = await app.handle(new Request(`http://localhost/people/${TEST_PERSON_ID.toLowerCase()}`));
      expect(response.status).toBe(200);

      // uppercase
      response = await app.handle(new Request(`http://localhost/people/${TEST_PERSON_ID.toUpperCase()}`));
      expect(response.status).toBe(200);
    });
  });

  describe("Response Format", () => {
    it("should return consistent success response format", async () => {
      const response = await app.handle(new Request("http://localhost/people"));
      const data = await response.json();

      expect(data).toHaveProperty("success", true);
      expect(data).toHaveProperty("data");
    });

    it("should return consistent error response format", async () => {
      const response = await app.handle(new Request("http://localhost/people?relation_type=invalid"));
      const data = await response.json();

      expect(data).toHaveProperty("success", false);
      expect(data).toHaveProperty("error");
      expect(typeof data.error).toBe("string");
    });

    it("should include message on create success", async () => {
      const response = await app.handle(
        new Request("http://localhost/people", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Test", relation_type: "friend" }),
        })
      );
      const data = await response.json();

      expect(data).toHaveProperty("message");
    });

    it("should include message on update success", async () => {
      const response = await app.handle(
        new Request(`http://localhost/people/${TEST_PERSON_ID}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Updated" }),
        })
      );
      const data = await response.json();

      expect(data).toHaveProperty("message");
    });
  });
});

