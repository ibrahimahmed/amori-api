import { Elysia, t } from "elysia";
import { authMiddleware } from "../auth";
import { peopleService } from "./people.service";
import type { RelationType } from "../../libs/db/schema";

const relationTypes = ["partner", "spouse", "parent", "child", "sibling", "friend", "colleague", "mentor", "other"];

export const peopleRoutes = new Elysia({ prefix: "/people" })
  .use(authMiddleware)
  // Get all people
  .get(
    "/",
    async ({ user, query }) => {
      const people = await peopleService.getAll(user.id, {
        relationType: query.relation_type as RelationType | undefined,
      });
      return { success: true, data: people };
    },
    {
      query: t.Object({
        relation_type: t.Optional(t.String()),
      }),
      detail: {
        tags: ["people"],
        summary: "Get all people",
        description: "Get all relationships for the authenticated user",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Get upcoming birthdays and anniversaries in one call
  .get(
    "/upcoming",
    async ({ user, query }) => {
      const events = await peopleService.getUpcomingEvents(user.id, query.days || 30);
      return { success: true, data: events };
    },
    {
      query: t.Object({
        days: t.Optional(t.Number({ minimum: 1, maximum: 365 })),
      }),
      detail: {
        tags: ["people"],
        summary: "Get upcoming events",
        description: "Get upcoming birthdays and anniversaries in a single optimized call",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Get single person with full profile
  .get(
    "/:id",
    async ({ user, params, set }) => {
      const profile = await peopleService.getFullProfile(user.id, params.id);
      if (!profile) {
        set.status = 404;
        return { success: false, error: "Person not found" };
      }
      return { success: true, data: profile };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        tags: ["people"],
        summary: "Get person profile",
        description: "Get full profile of a person including memories, upcoming plans, and wishlist",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Create person
  .post(
    "/",
    async ({ user, body }) => {
      const person = await peopleService.create({
        user_id: user.id,
        name: body.name,
        relation_type: body.relation_type as RelationType,
        birthday: body.birthday ? new Date(body.birthday) : null,
        anniversary: body.anniversary ? new Date(body.anniversary) : null,
        notes: body.notes,
        avatar_url: body.avatar_url,
        phone: body.phone,
        email: body.email,
      });
      return { success: true, data: person };
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        relation_type: t.String(),
        birthday: t.Optional(t.String()),
        anniversary: t.Optional(t.String()),
        notes: t.Optional(t.String()),
        avatar_url: t.Optional(t.String()),
        phone: t.Optional(t.String()),
        email: t.Optional(t.String()),
      }),
      detail: {
        tags: ["people"],
        summary: "Create person",
        description: "Add a new relationship",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Update person
  .patch(
    "/:id",
    async ({ user, params, body, set }) => {
      const person = await peopleService.update(user.id, params.id, {
        name: body.name,
        relation_type: body.relation_type as RelationType | undefined,
        birthday: body.birthday ? new Date(body.birthday) : undefined,
        anniversary: body.anniversary ? new Date(body.anniversary) : undefined,
        notes: body.notes,
        avatar_url: body.avatar_url,
        phone: body.phone,
        email: body.email,
      });
      if (!person) {
        set.status = 404;
        return { success: false, error: "Person not found" };
      }
      return { success: true, data: person };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1 })),
        relation_type: t.Optional(t.String()),
        birthday: t.Optional(t.String()),
        anniversary: t.Optional(t.String()),
        notes: t.Optional(t.String()),
        avatar_url: t.Optional(t.String()),
        phone: t.Optional(t.String()),
        email: t.Optional(t.String()),
      }),
      detail: {
        tags: ["people"],
        summary: "Update person",
        description: "Update an existing relationship",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Delete person
  .delete(
    "/:id",
    async ({ user, params, set }) => {
      const deleted = await peopleService.delete(user.id, params.id);
      if (!deleted) {
        set.status = 404;
        return { success: false, error: "Person not found" };
      }
      set.status = 204;
      return null;
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        tags: ["people"],
        summary: "Delete person",
        description: "Delete a relationship",
        security: [{ bearerAuth: [] }],
      },
    }
  );
