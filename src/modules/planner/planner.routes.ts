import { Elysia, t } from "elysia";
import { authMiddleware } from "../auth";
import { plannerService } from "./planner.service";
import type { EventType } from "../../libs/db/schema";

export const plannerRoutes = new Elysia({ prefix: "/planner" })
  .use(authMiddleware)
  // Get all events
  .get(
    "/",
    async ({ user, query }) => {
      const events = await plannerService.getAll(user.id, {
        personId: query.person_id,
        eventType: query.event_type as EventType | undefined,
        startDate: query.start_date ? new Date(query.start_date) : undefined,
        endDate: query.end_date ? new Date(query.end_date) : undefined,
        completed: query.completed !== undefined ? query.completed === "true" : undefined,
      });
      return { success: true, data: events };
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
    async ({ user, query }) => {
      const events = await plannerService.getUpcoming(user.id, query.days || 7);
      return { success: true, data: events };
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
    async ({ user }) => {
      const events = await plannerService.getOverdue(user.id);
      return { success: true, data: events };
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
    async ({ user, params }) => {
      const events = await plannerService.getByMonth(user.id, parseInt(params.year), parseInt(params.month));
      return { success: true, data: events };
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
    async ({ user, params }) => {
      const events = await plannerService.getByDate(user.id, new Date(params.date));
      return { success: true, data: events };
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
    async ({ user }) => {
      const stats = await plannerService.getStats(user.id);
      return { success: true, data: stats };
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
      const event = await plannerService.getById(user.id, params.id);
      if (!event) {
        set.status = 404;
        return { success: false, error: "Event not found" };
      }
      return { success: true, data: event };
    },
    {
      params: t.Object({
        id: t.String(),
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
    async ({ user, body }) => {
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
      return { success: true, data: event };
    },
    {
      body: t.Object({
        person_id: t.Optional(t.String()),
        event_type: t.String(),
        title: t.String({ minLength: 1 }),
        description: t.Optional(t.String()),
        date: t.String(),
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
      return { success: true, data: event };
    },
    {
      params: t.Object({
        id: t.String(),
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
      const event = await plannerService.markCompleted(user.id, params.id, body.completed ?? true);
      if (!event) {
        set.status = 404;
        return { success: false, error: "Event not found" };
      }
      return { success: true, data: event };
    },
    {
      params: t.Object({
        id: t.String(),
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
      const deleted = await plannerService.delete(user.id, params.id);
      if (!deleted) {
        set.status = 404;
        return { success: false, error: "Event not found" };
      }
      set.status = 204;
      return null;
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        tags: ["planner"],
        summary: "Delete event",
        description: "Delete a planner event",
        security: [{ bearerAuth: [] }],
      },
    }
  );

