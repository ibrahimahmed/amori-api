import { Elysia, t } from "elysia";
import { authMiddleware } from "../auth";
import { peopleService, ServiceError } from "./people.service";
import type { RelationType } from "../../libs/db/schema";
import { logger } from "../../libs/logger";
import { peopleReadRateLimit, peopleWriteRateLimit } from "../../middlewares/rateLimit";

const RELATION_TYPES = ["partner", "spouse", "parent", "child", "sibling", "friend", "colleague", "mentor", "other"] as const;

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
 * Read routes (GET) - 60 requests per minute
 */
const readRoutes = new Elysia()
  .use(authMiddleware)
  .use(peopleReadRateLimit)
  // Get all people
  .get(
    "/",
    async ({ user, query, set }) => {
      try {
        if (query.relation_type && !RELATION_TYPES.includes(query.relation_type as (typeof RELATION_TYPES)[number])) {
          set.status = 400;
          return { success: false, error: `Invalid relation_type. Must be one of: ${RELATION_TYPES.join(", ")}` };
        }
        const people = await peopleService.getAll(user.id, {
          relationType: query.relation_type as RelationType | undefined,
        });
        return { success: true, data: people };
      } catch (error) {
        return handleError(error, set, { userId: user.id, operation: "getAll" });
      }
    },
    {
      query: t.Object({
        relation_type: t.Optional(t.String()),
      }),
      detail: {
        tags: ["people"],
        summary: "Get all people",
        description: "Get all relationships for the authenticated user. Rate limit: 60/min",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Get upcoming birthdays and anniversaries in one call
  .get(
    "/upcoming",
    async ({ user, query, set }) => {
      try {
        const events = await peopleService.getUpcomingEvents(user.id, query.days || 30);
        return { success: true, data: events };
      } catch (error) {
        return handleError(error, set, { userId: user.id, operation: "getUpcomingEvents" });
      }
    },
    {
      query: t.Object({
        days: t.Optional(t.Number({ minimum: 1, maximum: 365 })),
      }),
      detail: {
        tags: ["people"],
        summary: "Get upcoming events",
        description: "Get upcoming birthdays, anniversaries, memory anniversaries, and plans. Rate limit: 60/min",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Get single person with full profile
  .get(
    "/:id",
    async ({ user, params, set }) => {
      try {
        const profile = await peopleService.getFullProfile(user.id, params.id);
        if (!profile) {
          set.status = 404;
          return { success: false, error: "Person not found" };
        }
        return { success: true, data: profile };
      } catch (error) {
        return handleError(error, set, { userId: user.id, operation: "getFullProfile" });
      }
    },
    {
      params: t.Object({
        id: t.String({ format: "uuid", error: "Invalid person ID format" }),
      }),
      detail: {
        tags: ["people"],
        summary: "Get person profile",
        description: "Get full profile of a person including memories, upcoming plans, and wishlist. Rate limit: 60/min",
        security: [{ bearerAuth: [] }],
      },
    }
  );

/**
 * Write routes (POST, PATCH, DELETE) - 20 requests per minute
 */
const writeRoutes = new Elysia()
  .use(authMiddleware)
  .use(peopleWriteRateLimit)
  // Create person
  .post(
    "/",
    async ({ user, body, set }) => {
      try {
        if (!RELATION_TYPES.includes(body.relation_type as (typeof RELATION_TYPES)[number])) {
          set.status = 400;
          return { success: false, error: `Invalid relation_type. Must be one of: ${RELATION_TYPES.join(", ")}` };
        }
        if (body.birthday && isNaN(Date.parse(body.birthday))) {
          set.status = 400;
          return { success: false, error: "Invalid birthday date format" };
        }
        if (body.anniversary && isNaN(Date.parse(body.anniversary))) {
          set.status = 400;
          return { success: false, error: "Invalid anniversary date format" };
        }
        const person = await peopleService.create({
          user_id: user.id,
          name: body.name,
          relation_type: body.relation_type as RelationType,
          birthday: body.birthday ? new Date(body.birthday) : null,
          anniversary: body.anniversary ? new Date(body.anniversary) : null,
          notes: body.notes,
          person_notes: body.person_notes ?? null,
          avatar_url: body.avatar_url,
          phone: body.phone,
          email: body.email,
        });
        set.status = 201;
        return { success: true, data: person, message: "Person created successfully" };
      } catch (error) {
        return handleError(error, set, { userId: user.id, operation: "create" });
      }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, error: "Name is required" }),
        relation_type: t.String({ error: "Relation type is required" }),
        birthday: t.Optional(t.String()),
        anniversary: t.Optional(t.String()),
        notes: t.Optional(t.String()),
        person_notes: t.Optional(t.Array(t.String())),
        avatar_url: t.Optional(t.String()),
        phone: t.Optional(t.String()),
        email: t.Optional(t.String({ format: "email", error: "Invalid email format" })),
      }),
      detail: {
        tags: ["people"],
        summary: "Create person",
        description: "Add a new relationship. Rate limit: 20/min",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Update person
  .patch(
    "/:id",
    async ({ user, params, body, set }) => {
      try {
        if (body.relation_type && !RELATION_TYPES.includes(body.relation_type as (typeof RELATION_TYPES)[number])) {
          set.status = 400;
          return { success: false, error: `Invalid relation_type. Must be one of: ${RELATION_TYPES.join(", ")}` };
        }
        if (body.birthday && isNaN(Date.parse(body.birthday))) {
          set.status = 400;
          return { success: false, error: "Invalid birthday date format" };
        }
        if (body.anniversary && isNaN(Date.parse(body.anniversary))) {
          set.status = 400;
          return { success: false, error: "Invalid anniversary date format" };
        }
        const person = await peopleService.update(user.id, params.id, {
          name: body.name,
          relation_type: body.relation_type as RelationType | undefined,
          birthday: body.birthday ? new Date(body.birthday) : undefined,
          anniversary: body.anniversary ? new Date(body.anniversary) : undefined,
          notes: body.notes,
          person_notes: body.person_notes,
          avatar_url: body.avatar_url,
          phone: body.phone,
          email: body.email,
        });
        if (!person) {
          set.status = 404;
          return { success: false, error: "Person not found" };
        }
        return { success: true, data: person, message: "Person updated successfully" };
      } catch (error) {
        return handleError(error, set, { userId: user.id, operation: "update" });
      }
    },
    {
      params: t.Object({
        id: t.String({ format: "uuid", error: "Invalid person ID format" }),
      }),
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1 })),
        relation_type: t.Optional(t.String()),
        birthday: t.Optional(t.String()),
        anniversary: t.Optional(t.String()),
        notes: t.Optional(t.String()),
        person_notes: t.Optional(t.Array(t.String())),
        avatar_url: t.Optional(t.String()),
        phone: t.Optional(t.String()),
        email: t.Optional(t.String({ format: "email", error: "Invalid email format" })),
      }),
      detail: {
        tags: ["people"],
        summary: "Update person",
        description: "Update an existing relationship. Rate limit: 20/min",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Delete person
  .delete(
    "/:id",
    async ({ user, params, set }) => {
      try {
        const deleted = await peopleService.delete(user.id, params.id);
        if (!deleted) {
          set.status = 404;
          return { success: false, error: "Person not found" };
        }
        set.status = 204;
        return null;
      } catch (error) {
        return handleError(error, set, { userId: user.id, operation: "delete" });
      }
    },
    {
      params: t.Object({
        id: t.String({ format: "uuid", error: "Invalid person ID format" }),
      }),
      detail: {
        tags: ["people"],
        summary: "Delete person",
        description: "Delete a relationship and all associated data. Rate limit: 20/min",
        security: [{ bearerAuth: [] }],
      },
    }
  );

/**
 * People routes - combines read and write routes
 */
export const peopleRoutes = new Elysia({ prefix: "/people" })
  .use(readRoutes)
  .use(writeRoutes);
