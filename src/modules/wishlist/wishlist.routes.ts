import { Elysia, t } from "elysia";
import { authMiddleware } from "../auth";
import { wishlistService, ServiceError } from "./wishlist.service";
import type { Priority } from "../../libs/db/schema";
import { logger } from "../../libs/logger";
import { generalRateLimit } from "../../middlewares/rateLimit";

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

export const wishlistRoutes = new Elysia({ prefix: "/wishlist" })
  .use(authMiddleware)
  .use(generalRateLimit)
  // Get all wishlist items
  .get(
    "/",
    async ({ user, query, set }) => {
      try {
        const items = await wishlistService.getAll(user.id, {
          personId: query.person_id,
          priority: query.priority as Priority | undefined,
          purchased: query.purchased !== undefined ? query.purchased === "true" : undefined,
        });
        return { success: true, data: items };
      } catch (error) {
        return handleError(error, set, { userId: user.id, operation: "wishlist.getAll" });
      }
    },
    {
      query: t.Object({
        person_id: t.Optional(t.String()),
        priority: t.Optional(t.String()),
        purchased: t.Optional(t.String()),
      }),
      detail: {
        tags: ["wishlist"],
        summary: "Get all wishlist items",
        description: "Get all wishlist items with optional filters",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Get items grouped by person
  .get(
    "/grouped",
    async ({ user, set }) => {
      try {
        const grouped = await wishlistService.getGroupedByPerson(user.id);
        return { success: true, data: grouped };
      } catch (error) {
        return handleError(error, set, { userId: user.id, operation: "wishlist.getGroupedByPerson" });
      }
    },
    {
      detail: {
        tags: ["wishlist"],
        summary: "Get items grouped by person",
        description: "Get all wishlist items grouped by person",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Get purchase history
  .get(
    "/history",
    async ({ user, set }) => {
      try {
        const items = await wishlistService.getPurchaseHistory(user.id);
        return { success: true, data: items };
      } catch (error) {
        return handleError(error, set, { userId: user.id, operation: "wishlist.getPurchaseHistory" });
      }
    },
    {
      detail: {
        tags: ["wishlist"],
        summary: "Get purchase history",
        description: "Get all purchased items",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Get single item
  .get(
    "/:id",
    async ({ user, params, set }) => {
      try {
        const item = await wishlistService.getById(user.id, params.id);
        if (!item) {
          set.status = 404;
          return { success: false, error: "Item not found" };
        }
        return { success: true, data: item };
      } catch (error) {
        return handleError(error, set, { userId: user.id, operation: "wishlist.getById" });
      }
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        tags: ["wishlist"],
        summary: "Get item by ID",
        description: "Get a specific wishlist item",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Create item
  .post(
    "/",
    async ({ user, body, set }) => {
      try {
        const item = await wishlistService.create({
          user_id: user.id,
          person_id: body.person_id,
          title: body.title,
          description: body.description,
          price_range: body.price_range,
          url: body.url,
          image_url: body.image_url,
          priority: (body.priority as Priority) || "medium",
          notes: body.notes,
        });
        set.status = 201;
        return { success: true, data: item };
      } catch (error) {
        return handleError(error, set, { userId: user.id, operation: "wishlist.create" });
      }
    },
    {
      body: t.Object({
        person_id: t.Optional(t.String()),
        title: t.String({ minLength: 1 }),
        description: t.Optional(t.String()),
        price_range: t.Optional(t.String()),
        url: t.Optional(t.String()),
        image_url: t.Optional(t.String()),
        priority: t.Optional(t.String()),
        notes: t.Optional(t.String()),
      }),
      detail: {
        tags: ["wishlist"],
        summary: "Create item",
        description: "Add a new wishlist item",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Update item
  .patch(
    "/:id",
    async ({ user, params, body, set }) => {
      try {
        const item = await wishlistService.update(user.id, params.id, {
          person_id: body.person_id,
          title: body.title,
          description: body.description,
          price_range: body.price_range,
          url: body.url,
          image_url: body.image_url,
          priority: body.priority as Priority | undefined,
          notes: body.notes,
        });
        if (!item) {
          set.status = 404;
          return { success: false, error: "Item not found" };
        }
        return { success: true, data: item };
      } catch (error) {
        return handleError(error, set, { userId: user.id, operation: "wishlist.update" });
      }
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        person_id: t.Optional(t.String()),
        title: t.Optional(t.String({ minLength: 1 })),
        description: t.Optional(t.String()),
        price_range: t.Optional(t.String()),
        url: t.Optional(t.String()),
        image_url: t.Optional(t.String()),
        priority: t.Optional(t.String()),
        notes: t.Optional(t.String()),
      }),
      detail: {
        tags: ["wishlist"],
        summary: "Update item",
        description: "Update a wishlist item",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Mark as purchased
  .post(
    "/:id/purchase",
    async ({ user, params, body, set }) => {
      try {
        const item = await wishlistService.markPurchased(user.id, params.id, body.purchased ?? true);
        if (!item) {
          set.status = 404;
          return { success: false, error: "Item not found" };
        }
        return { success: true, data: item };
      } catch (error) {
        return handleError(error, set, { userId: user.id, operation: "wishlist.markPurchased" });
      }
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        purchased: t.Optional(t.Boolean()),
      }),
      detail: {
        tags: ["wishlist"],
        summary: "Mark as purchased",
        description: "Mark a wishlist item as purchased or unpurchased",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Delete item
  .delete(
    "/:id",
    async ({ user, params, set }) => {
      try {
        const deleted = await wishlistService.delete(user.id, params.id);
        if (!deleted) {
          set.status = 404;
          return { success: false, error: "Item not found" };
        }
        set.status = 204;
        return null;
      } catch (error) {
        return handleError(error, set, { userId: user.id, operation: "wishlist.delete" });
      }
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        tags: ["wishlist"],
        summary: "Delete item",
        description: "Delete a wishlist item",
        security: [{ bearerAuth: [] }],
      },
    }
  );


