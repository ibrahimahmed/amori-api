import { Elysia, t } from "elysia";
import { authMiddleware } from "../auth";
import { plannerService, ServiceError } from "./planner.service";
import type { EventType } from "../../libs/db/schema";
import { logger } from "../../libs/logger";
import { generalRateLimit } from "../../middlewares/rateLimit";

const EVENT_TYPES = ["birthday", "anniversary", "date", "meeting", "call", "gift", "trip", "other"] as const;

/**
 * Handle service errors and return appropriate HTTP response
 */
function handleError(
  error: unknown,
  set: { status?: number | string },
  context: { userId?: string; operation: string }
): { success: false; error: string } {
  if (error instanceof ServiceError) {
    set.status = error.statusCode;
    return { success: false, error: error.message };
  }
  logger.error(`Unexpected error in ${context.operation}`, error as Error, { userId: context.userId });
  set.status = 500;
  return { success: false, error: "Internal server error" };
}

/**
 * Validate date string and return Date object or null if invalid
 */
function parseDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
}

export const plannerRoutes = new Elysia({ prefix: "/planner" })
  .use(authMiddleware)
  .use(generalRateLimit)
  // Get all events
  .get(
    "/",
    async ({ user, query, set }) => {
      try {
        // Validate event_type if provided
        if (query.event_type && !EVENT_TYPES.includes(query.event_type as (typeof EVENT_TYPES)[number])) {
          set.status = 400;
          return { success: false, error: `Invalid event_type. Must be one of: ${EVENT_TYPES.join(", ")}` };
        }

        // Validate date filters
        if (query.start_date && isNaN(Date.parse(query.start_date))) {
          set.status = 400;
          return { success: false, error: "Invalid start_date format" };
        }
        if (query.end_date && isNaN(Date.parse(query.end_date))) {
          set.status = 400;
          return { success: false, error: "Invalid end_date format" };
        }

        const events = await plannerService.getAll(user.id, {
          personId: query.person_id,
          eventType: query.event_type as EventType | undefined,
          startDate: query.start_date ? new Date(query.start_date) : undefined,
          endDate: query.end_date ? new Date(query.end_date) : undefined,
          completed: query.completed !== undefined ? query.completed === "true" : undefined,
        });
        return { success: true, data: events };
      } catch (error) {
        return handleError(error, set, { userId: user.id, operation: "planner.getAll" });
      }
    },
    {
      query: t.Object({
        person_id: t.Optional(t.String()),
        event_type: t.Optional(t.String()),
        start_date: t.Optional(t.String()),
        end_date: t.Optional(t.String()),
        completed: t.Optional(t.String()),
      }),
      detail: {
        tags: ["planner"],
        summary: "Get all events",
        description: "Get all planner events with optional filters",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Get upcoming events
  .get(
    "/upcoming",
    async ({ user, query, set }) => {
      try {
        const events = await plannerService.getUpcoming(user.id, query.days || 7);
        return { success: true, data: events };
      } catch (error) {
        return handleError(error, set, { userId: user.id, operation: "planner.getUpcoming" });
      }
    },
    {
      query: t.Object({
        days: t.Optional(t.Number({ minimum: 1, maximum: 365 })),
      }),
      detail: {
        tags: ["planner"],
        summary: "Get upcoming events",
        description: "Get events coming up in the next N days",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Get overdue events
  .get(
    "/overdue",
    async ({ user, set }) => {
      try {
        const events = await plannerService.getOverdue(user.id);
        return { success: true, data: events };
      } catch (error) {
        return handleError(error, set, { userId: user.id, operation: "planner.getOverdue" });
      }
    },
    {
      detail: {
        tags: ["planner"],
        summary: "Get overdue events",
        description: "Get events that are past due and not completed",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Get events by month (calendar view)
  .get(
    "/calendar/:year/:month",
    async ({ user, params, set }) => {
      try {
        const year = parseInt(params.year);
        const month = parseInt(params.month);

        // Validate year and month
        if (isNaN(year) || year < 1900 || year > 2100) {
          set.status = 400;
          return { success: false, error: "Invalid year. Must be between 1900 and 2100" };
        }
        if (isNaN(month) || month < 1 || month > 12) {
          set.status = 400;
          return { success: false, error: "Invalid month. Must be between 1 and 12" };
        }

        const events = await plannerService.getByMonth(user.id, year, month);
        return { success: true, data: events };
      } catch (error) {
        return handleError(error, set, { userId: user.id, operation: "planner.getByMonth" });
      }
    },
    {
      params: t.Object({
        year: t.String(),
        month: t.String(),
      }),
      detail: {
        tags: ["planner"],
        summary: "Get events by month",
        description: "Get events for a specific month (calendar view)",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Get events for a specific date
  .get(
    "/date/:date",
    async ({ user, params, set }) => {
      try {
        const date = parseDate(params.date);
        if (!date) {
          set.status = 400;
          return { success: false, error: "Invalid date format" };
        }

        const events = await plannerService.getByDate(user.id, date);
        return { success: true, data: events };
      } catch (error) {
        return handleError(error, set, { userId: user.id, operation: "planner.getByDate" });
      }
    },
    {
      params: t.Object({
        date: t.String(),
      }),
      detail: {
        tags: ["planner"],
        summary: "Get events by date",
        description: "Get events for a specific date",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Get statistics
  .get(
    "/stats",
    async ({ user, set }) => {
      try {
        const stats = await plannerService.getStats(user.id);
        return { success: true, data: stats };
      } catch (error) {
        return handleError(error, set, { userId: user.id, operation: "planner.getStats" });
      }
    },
    {
      detail: {
        tags: ["planner"],
        summary: "Get planner statistics",
        description: "Get statistics about planned events",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Get single event
  .get(
    "/:id",
    async ({ user, params, set }) => {
      try {
        const event = await plannerService.getById(user.id, params.id);
        if (!event) {
          set.status = 404;
          return { success: false, error: "Event not found" };
        }
        return { success: true, data: event };
      } catch (error) {
        return handleError(error, set, { userId: user.id, operation: "planner.getById" });
      }
    },
    {
      params: t.Object({
        id: t.String({ format: "uuid", error: "Invalid event ID format" }),
      }),
      detail: {
        tags: ["planner"],
        summary: "Get event by ID",
        description: "Get a specific planner event",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Create event
  .post(
    "/",
    async ({ user, body, set }) => {
      try {
        // Validate event_type
        if (!EVENT_TYPES.includes(body.event_type as (typeof EVENT_TYPES)[number])) {
          set.status = 400;
          return { success: false, error: `Invalid event_type. Must be one of: ${EVENT_TYPES.join(", ")}` };
        }

        // Validate date
        if (isNaN(Date.parse(body.date))) {
          set.status = 400;
          return { success: false, error: "Invalid date format" };
        }

        // Validate reminder_at if provided
        if (body.reminder_at && isNaN(Date.parse(body.reminder_at))) {
          set.status = 400;
          return { success: false, error: "Invalid reminder_at date format" };
        }

        const event = await plannerService.create({
          user_id: user.id,
          person_id: body.person_id,
          event_type: body.event_type as EventType,
          title: body.title,
          description: body.description,
          date: new Date(body.date),
          reminder_at: body.reminder_at ? new Date(body.reminder_at) : null,
          location: body.location,
          notes: body.notes,
        });

        set.status = 201;
        return { success: true, data: event, message: "Event created successfully" };
      } catch (error) {
        return handleError(error, set, { userId: user.id, operation: "planner.create" });
      }
    },
    {
      body: t.Object({
        person_id: t.Optional(t.String()),
        event_type: t.String({ error: "Event type is required" }),
        title: t.String({ minLength: 1, error: "Title is required" }),
        description: t.Optional(t.String()),
        date: t.String({ error: "Date is required" }),
        reminder_at: t.Optional(t.String()),
        location: t.Optional(t.String()),
        notes: t.Optional(t.String()),
      }),
      detail: {
        tags: ["planner"],
        summary: "Create event",
        description: "Create a new planner event",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Update event
  .patch(
    "/:id",
    async ({ user, params, body, set }) => {
      try {
        // Validate event_type if provided
        if (body.event_type && !EVENT_TYPES.includes(body.event_type as (typeof EVENT_TYPES)[number])) {
          set.status = 400;
          return { success: false, error: `Invalid event_type. Must be one of: ${EVENT_TYPES.join(", ")}` };
        }

        // Validate date if provided
        if (body.date && isNaN(Date.parse(body.date))) {
          set.status = 400;
          return { success: false, error: "Invalid date format" };
        }

        // Validate reminder_at if provided
        if (body.reminder_at && isNaN(Date.parse(body.reminder_at))) {
          set.status = 400;
          return { success: false, error: "Invalid reminder_at date format" };
        }

        const event = await plannerService.update(user.id, params.id, {
          person_id: body.person_id,
          event_type: body.event_type as EventType | undefined,
          title: body.title,
          description: body.description,
          date: body.date ? new Date(body.date) : undefined,
          reminder_at: body.reminder_at ? new Date(body.reminder_at) : undefined,
          location: body.location,
          notes: body.notes,
        });

        if (!event) {
          set.status = 404;
          return { success: false, error: "Event not found" };
        }
        return { success: true, data: event, message: "Event updated successfully" };
      } catch (error) {
        return handleError(error, set, { userId: user.id, operation: "planner.update" });
      }
    },
    {
      params: t.Object({
        id: t.String({ format: "uuid", error: "Invalid event ID format" }),
      }),
      body: t.Object({
        person_id: t.Optional(t.String()),
        event_type: t.Optional(t.String()),
        title: t.Optional(t.String({ minLength: 1 })),
        description: t.Optional(t.String()),
        date: t.Optional(t.String()),
        reminder_at: t.Optional(t.String()),
        location: t.Optional(t.String()),
        notes: t.Optional(t.String()),
      }),
      detail: {
        tags: ["planner"],
        summary: "Update event",
        description: "Update a planner event",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Mark as completed
  .post(
    "/:id/complete",
    async ({ user, params, body, set }) => {
      try {
        const event = await plannerService.markCompleted(user.id, params.id, body.completed ?? true);
        if (!event) {
          set.status = 404;
          return { success: false, error: "Event not found" };
        }
        return { success: true, data: event, message: `Event marked as ${body.completed !== false ? "completed" : "incomplete"}` };
      } catch (error) {
        return handleError(error, set, { userId: user.id, operation: "planner.markCompleted" });
      }
    },
    {
      params: t.Object({
        id: t.String({ format: "uuid", error: "Invalid event ID format" }),
      }),
      body: t.Object({
        completed: t.Optional(t.Boolean()),
      }),
      detail: {
        tags: ["planner"],
        summary: "Mark as completed",
        description: "Mark an event as completed or uncompleted",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Delete event
  .delete(
    "/:id",
    async ({ user, params, set }) => {
      try {
        const deleted = await plannerService.delete(user.id, params.id);
        if (!deleted) {
          set.status = 404;
          return { success: false, error: "Event not found" };
        }
        set.status = 204;
        return null;
      } catch (error) {
        return handleError(error, set, { userId: user.id, operation: "planner.delete" });
      }
    },
    {
      params: t.Object({
        id: t.String({ format: "uuid", error: "Invalid event ID format" }),
      }),
      detail: {
        tags: ["planner"],
        summary: "Delete event",
        description: "Delete a planner event",
        security: [{ bearerAuth: [] }],
      },
    }
  );
