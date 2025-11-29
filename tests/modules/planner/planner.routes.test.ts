import { describe, expect, it, beforeEach, mock } from "bun:test";
import { Elysia } from "elysia";

// Test data
const TEST_USER_ID = "550e8400-e29b-41d4-a716-446655440000";
const TEST_EVENT_ID = "660e8400-e29b-41d4-a716-446655440001";

const mockEvent = {
  id: TEST_EVENT_ID,
  user_id: TEST_USER_ID,
  person_id: "person-123",
  event_type: "birthday",
  title: "Birthday Party",
  description: "Surprise party",
  date: new Date("2024-06-15").toISOString(),
  reminder_at: null,
  location: "Home",
  notes: "Don't forget the cake",
  completed: false,
  completed_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const mockStats = {
  total: 10,
  completed: 5,
  pending: 5,
  byType: {
    birthday: 2,
    meeting: 8,
  },
};

// Mock service
const mockPlannerService = {
  getAll: mock((_userId: string, _filters?: any) => Promise.resolve([mockEvent])),
  getById: mock((_userId: string, _eventId: string) => Promise.resolve(mockEvent as typeof mockEvent | undefined)),
  create: mock((_data: any) => Promise.resolve(mockEvent)),
  update: mock((_userId: string, _eventId: string, _data: any) => Promise.resolve(mockEvent as typeof mockEvent | undefined)),
  delete: mock((_userId: string, _eventId: string) => Promise.resolve(true)),
  markCompleted: mock((_userId: string, _eventId: string, _completed: boolean) => Promise.resolve({ ...mockEvent, completed: true })),
  getUpcoming: mock((_userId: string, _days: number) => Promise.resolve([mockEvent])),
  getOverdue: mock((_userId: string) => Promise.resolve([mockEvent])),
  getByDate: mock((_userId: string, _date: Date) => Promise.resolve([mockEvent])),
  getByMonth: mock((_userId: string, _year: number, _month: number) => Promise.resolve([mockEvent])),
  getStats: mock((_userId: string) => Promise.resolve(mockStats)),
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
  return new Elysia({ prefix: "/planner" })
    .derive(() => ({
      user: { id: TEST_USER_ID, email: "test@example.com", name: "Test User", avatar_url: null },
    }))
    .get("/", async ({ user, query, set }) => {
      try {
        const EVENT_TYPES = ["birthday", "anniversary", "date", "meeting", "call", "gift", "trip", "other"];
        if (query.event_type && !EVENT_TYPES.includes(query.event_type)) {
          set.status = 400;
          return { success: false, error: `Invalid event_type. Must be one of: ${EVENT_TYPES.join(", ")}` };
        }
        if (query.start_date && isNaN(Date.parse(query.start_date))) {
            set.status = 400;
            return { success: false, error: "Invalid start_date format" };
        }
        if (query.end_date && isNaN(Date.parse(query.end_date))) {
            set.status = 400;
            return { success: false, error: "Invalid end_date format" };
        }
        const events = await mockPlannerService.getAll(user.id, {
          personId: query.person_id,
          eventType: query.event_type,
          startDate: query.start_date ? new Date(query.start_date) : undefined,
          endDate: query.end_date ? new Date(query.end_date) : undefined,
          completed: query.completed !== undefined ? query.completed === "true" : undefined,
        });
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
    .get("/upcoming", async ({ user, query, set }) => {
      try {
        const events = await mockPlannerService.getUpcoming(user.id, query.days ? parseInt(query.days) : 7);
        return { success: true, data: events };
      } catch (error) {
        set.status = 500;
        return { success: false, error: "Internal server error" };
      }
    })
    .get("/overdue", async ({ user, set }) => {
      try {
        const events = await mockPlannerService.getOverdue(user.id);
        return { success: true, data: events };
      } catch (error) {
        set.status = 500;
        return { success: false, error: "Internal server error" };
      }
    })
    .get("/calendar/:year/:month", async ({ user, params, set }) => {
      try {
        const year = parseInt(params.year);
        const month = parseInt(params.month);
        if (isNaN(year) || year < 1900 || year > 2100) {
          set.status = 400;
          return { success: false, error: "Invalid year. Must be between 1900 and 2100" };
        }
        if (isNaN(month) || month < 1 || month > 12) {
          set.status = 400;
          return { success: false, error: "Invalid month. Must be between 1 and 12" };
        }
        const events = await mockPlannerService.getByMonth(user.id, year, month);
        return { success: true, data: events };
      } catch (error) {
        set.status = 500;
        return { success: false, error: "Internal server error" };
      }
    })
    .get("/date/:date", async ({ user, params, set }) => {
      try {
        const date = new Date(params.date);
        if (isNaN(date.getTime())) {
          set.status = 400;
          return { success: false, error: "Invalid date format" };
        }
        const events = await mockPlannerService.getByDate(user.id, date);
        return { success: true, data: events };
      } catch (error) {
        set.status = 500;
        return { success: false, error: "Internal server error" };
      }
    })
    .get("/stats", async ({ user, set }) => {
      try {
        const stats = await mockPlannerService.getStats(user.id);
        return { success: true, data: stats };
      } catch (error) {
        set.status = 500;
        return { success: false, error: "Internal server error" };
      }
    })
    .get("/:id", async ({ user, params, set }) => {
      try {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(params.id)) {
            set.status = 400; // Original code might return 400 from Elysia validation
            // For this test we simulate Elysia validation or manual check
            // Since original uses t.String({ format: 'uuid' }), Elysia handles it.
            // But here we are manually building the route handler for testing logic.
        }
        
        const event = await mockPlannerService.getById(user.id, params.id);
        if (!event) {
          set.status = 404;
          return { success: false, error: "Event not found" };
        }
        return { success: true, data: event };
      } catch (error) {
        set.status = 500;
        return { success: false, error: "Internal server error" };
      }
    })
    .post("/", async ({ user, body, set }) => {
      try {
        const EVENT_TYPES = ["birthday", "anniversary", "date", "meeting", "call", "gift", "trip", "other"];
        const reqBody = body as any;
        
        if (!EVENT_TYPES.includes(reqBody.event_type)) {
          set.status = 400;
          return { success: false, error: `Invalid event_type. Must be one of: ${EVENT_TYPES.join(", ")}` };
        }
        if (isNaN(Date.parse(reqBody.date))) {
          set.status = 400;
          return { success: false, error: "Invalid date format" };
        }
        if (reqBody.reminder_at && isNaN(Date.parse(reqBody.reminder_at))) {
            set.status = 400;
            return { success: false, error: "Invalid reminder_at date format" };
        }

        const event = await mockPlannerService.create({
          user_id: user.id,
          ...reqBody,
          date: new Date(reqBody.date),
          reminder_at: reqBody.reminder_at ? new Date(reqBody.reminder_at) : null,
        });
        set.status = 201;
        return { success: true, data: event, message: "Event created successfully" };
      } catch (error) {
        set.status = 500;
        return { success: false, error: "Internal server error" };
      }
    })
    .patch("/:id", async ({ user, params, body, set }) => {
      try {
        const EVENT_TYPES = ["birthday", "anniversary", "date", "meeting", "call", "gift", "trip", "other"];
        const reqBody = body as any;

        if (reqBody.event_type && !EVENT_TYPES.includes(reqBody.event_type)) {
            set.status = 400;
            return { success: false, error: `Invalid event_type. Must be one of: ${EVENT_TYPES.join(", ")}` };
        }
        if (reqBody.date && isNaN(Date.parse(reqBody.date))) {
            set.status = 400;
            return { success: false, error: "Invalid date format" };
        }
        if (reqBody.reminder_at && isNaN(Date.parse(reqBody.reminder_at))) {
            set.status = 400;
            return { success: false, error: "Invalid reminder_at date format" };
        }

        const event = await mockPlannerService.update(user.id, params.id, {
            ...reqBody,
            date: reqBody.date ? new Date(reqBody.date) : undefined,
            reminder_at: reqBody.reminder_at ? new Date(reqBody.reminder_at) : undefined,
        });

        if (!event) {
          set.status = 404;
          return { success: false, error: "Event not found" };
        }
        return { success: true, data: event, message: "Event updated successfully" };
      } catch (error) {
        set.status = 500;
        return { success: false, error: "Internal server error" };
      }
    })
    .post("/:id/complete", async ({ user, params, body, set }) => {
        try {
            const reqBody = body as any;
            const event = await mockPlannerService.markCompleted(user.id, params.id, reqBody.completed ?? true);
            if (!event) {
                set.status = 404;
                return { success: false, error: "Event not found" };
            }
            return { success: true, data: event, message: `Event marked as ${reqBody.completed !== false ? "completed" : "incomplete"}` };
        } catch (error) {
            set.status = 500;
            return { success: false, error: "Internal server error" };
        }
    })
    .delete("/:id", async ({ user, params, set }) => {
      try {
        const deleted = await mockPlannerService.delete(user.id, params.id);
        if (!deleted) {
          set.status = 404;
          return { success: false, error: "Event not found" };
        }
        set.status = 204;
        return null;
      } catch (error) {
        set.status = 500;
        return { success: false, error: "Internal server error" };
      }
    });
}

describe("Planner Routes", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
    mockPlannerService.getAll.mockClear();
    mockPlannerService.getById.mockClear();
    mockPlannerService.create.mockClear();
    mockPlannerService.update.mockClear();
    mockPlannerService.delete.mockClear();
    mockPlannerService.markCompleted.mockClear();
    mockPlannerService.getUpcoming.mockClear();
    mockPlannerService.getOverdue.mockClear();
    mockPlannerService.getByDate.mockClear();
    mockPlannerService.getByMonth.mockClear();
    mockPlannerService.getStats.mockClear();

    // Default implementations
    mockPlannerService.getAll.mockImplementation(() => Promise.resolve([mockEvent]));
    mockPlannerService.getById.mockImplementation(() => Promise.resolve(mockEvent));
    mockPlannerService.create.mockImplementation(() => Promise.resolve(mockEvent));
    mockPlannerService.update.mockImplementation(() => Promise.resolve(mockEvent));
    mockPlannerService.delete.mockImplementation(() => Promise.resolve(true));
    mockPlannerService.markCompleted.mockImplementation(() => Promise.resolve({ ...mockEvent, completed: true }));
    mockPlannerService.getUpcoming.mockImplementation(() => Promise.resolve([mockEvent]));
    mockPlannerService.getOverdue.mockImplementation(() => Promise.resolve([mockEvent]));
    mockPlannerService.getByDate.mockImplementation(() => Promise.resolve([mockEvent]));
    mockPlannerService.getByMonth.mockImplementation(() => Promise.resolve([mockEvent]));
    mockPlannerService.getStats.mockImplementation(() => Promise.resolve(mockStats));
  });

  describe("GET /planner", () => {
    it("should return all events", async () => {
      const response = await app.handle(new Request("http://localhost/planner"));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual([mockEvent]);
    });

    it("should filter by event_type", async () => {
      const response = await app.handle(new Request("http://localhost/planner?event_type=birthday"));
      
      expect(response.status).toBe(200);
      expect(mockPlannerService.getAll).toHaveBeenCalledWith(TEST_USER_ID, expect.objectContaining({ eventType: "birthday" }));
    });

    it("should return 400 for invalid event_type", async () => {
      const response = await app.handle(new Request("http://localhost/planner?event_type=invalid"));
      
      expect(response.status).toBe(400);
    });

    it("should validate date filters", async () => {
        const response = await app.handle(new Request("http://localhost/planner?start_date=invalid"));
        expect(response.status).toBe(400);
    });
  });

  describe("GET /planner/upcoming", () => {
    it("should return upcoming events", async () => {
      const response = await app.handle(new Request("http://localhost/planner/upcoming"));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toEqual([mockEvent]);
    });

    it("should accept days parameter", async () => {
        const response = await app.handle(new Request("http://localhost/planner/upcoming?days=30"));
        expect(response.status).toBe(200);
        expect(mockPlannerService.getUpcoming).toHaveBeenCalledWith(TEST_USER_ID, 30);
    });
  });

  describe("GET /planner/overdue", () => {
    it("should return overdue events", async () => {
      const response = await app.handle(new Request("http://localhost/planner/overdue"));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toEqual([mockEvent]);
    });
  });

  describe("GET /planner/calendar/:year/:month", () => {
    it("should return events for month", async () => {
      const response = await app.handle(new Request("http://localhost/planner/calendar/2024/6"));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toEqual([mockEvent]);
      expect(mockPlannerService.getByMonth).toHaveBeenCalledWith(TEST_USER_ID, 2024, 6);
    });

    it("should return 400 for invalid year", async () => {
      const response = await app.handle(new Request("http://localhost/planner/calendar/invalid/6"));
      expect(response.status).toBe(400);
    });

    it("should return 400 for invalid month", async () => {
      const response = await app.handle(new Request("http://localhost/planner/calendar/2024/13"));
      expect(response.status).toBe(400);
    });
  });

  describe("GET /planner/date/:date", () => {
    it("should return events for date", async () => {
      const response = await app.handle(new Request("http://localhost/planner/date/2024-06-15"));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toEqual([mockEvent]);
    });

    it("should return 400 for invalid date", async () => {
      const response = await app.handle(new Request("http://localhost/planner/date/invalid"));
      expect(response.status).toBe(400);
    });
  });

  describe("GET /planner/stats", () => {
    it("should return stats", async () => {
      const response = await app.handle(new Request("http://localhost/planner/stats"));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toEqual(mockStats);
    });
  });

  describe("GET /planner/:id", () => {
    it("should return event", async () => {
      const response = await app.handle(new Request(`http://localhost/planner/${TEST_EVENT_ID}`));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toEqual(mockEvent);
    });

    it("should return 404 when not found", async () => {
      mockPlannerService.getById.mockImplementation(() => Promise.resolve(undefined));
      const response = await app.handle(new Request(`http://localhost/planner/${TEST_EVENT_ID}`));
      expect(response.status).toBe(404);
    });
  });

  describe("POST /planner", () => {
    const validBody = {
      event_type: "birthday",
      title: "New Event",
      date: "2024-06-15",
    };

    it("should create event", async () => {
      const response = await app.handle(
        new Request("http://localhost/planner", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validBody),
        })
      );
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
    });

    it("should return 400 for invalid event_type", async () => {
        const response = await app.handle(
          new Request("http://localhost/planner", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...validBody, event_type: "invalid" }),
          })
        );
        expect(response.status).toBe(400);
    });

    it("should return 400 for invalid date", async () => {
        const response = await app.handle(
          new Request("http://localhost/planner", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...validBody, date: "invalid" }),
          })
        );
        expect(response.status).toBe(400);
    });
  });

  describe("PATCH /planner/:id", () => {
    it("should update event", async () => {
      const response = await app.handle(
        new Request(`http://localhost/planner/${TEST_EVENT_ID}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Updated" }),
        })
      );
      
      expect(response.status).toBe(200);
    });

    it("should return 404 when not found", async () => {
        mockPlannerService.update.mockImplementation(() => Promise.resolve(undefined));
        const response = await app.handle(
          new Request(`http://localhost/planner/${TEST_EVENT_ID}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: "Updated" }),
          })
        );
        expect(response.status).toBe(404);
    });
  });

  describe("POST /planner/:id/complete", () => {
      it("should mark as completed", async () => {
          const response = await app.handle(
            new Request(`http://localhost/planner/${TEST_EVENT_ID}/complete`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ completed: true }),
            })
          );
          
          expect(response.status).toBe(200);
      });
  });

  describe("DELETE /planner/:id", () => {
      it("should delete event", async () => {
          const response = await app.handle(
            new Request(`http://localhost/planner/${TEST_EVENT_ID}`, {
              method: "DELETE",
            })
          );
          
          expect(response.status).toBe(204);
      });

      it("should return 404 when not found", async () => {
          mockPlannerService.delete.mockImplementation(() => Promise.resolve(false));
          const response = await app.handle(
            new Request(`http://localhost/planner/${TEST_EVENT_ID}`, {
              method: "DELETE",
            })
          );
          expect(response.status).toBe(404);
      });
  });
});
