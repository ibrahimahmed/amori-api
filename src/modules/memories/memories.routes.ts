import { Elysia, t } from "elysia";
import { authMiddleware } from "../auth";
import { memoriesService, ServiceError } from "./memories.service";
import { generalRateLimit } from "../../middlewares/rateLimit";
import { logger } from "../../libs/logger";

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

export const memoriesRoutes = new Elysia({ prefix: "/memories" })
  .use(authMiddleware)
  .use(generalRateLimit)
  // Get all memories
  .get(
    "/",
    async ({ user, query, set }) => {
      try {
        const memories = await memoriesService.getAll(user.id, {
          personId: query.person_id,
          startDate: query.start_date ? new Date(query.start_date) : undefined,
          endDate: query.end_date ? new Date(query.end_date) : undefined,
          tags: query.tags?.split(",").filter(Boolean),
          isFavorite: query.favorites ? query.favorites === "true" : undefined,
        });
        return { success: true, data: memories };
      } catch (error) {
        return handleError(error, set, { userId: user.id, operation: "memories.getAll" });
      }
    },
    {
      query: t.Object({
        person_id: t.Optional(t.String()),
        start_date: t.Optional(t.String()),
        end_date: t.Optional(t.String()),
        tags: t.Optional(t.String()),
        favorites: t.Optional(t.String()),
      }),
      detail: {
        tags: ["memories"],
        summary: "Get all memories",
        description: "Get all memories with optional filters",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Get favorite memories
  .get(
    "/favorites",
    async ({ user, set }) => {
      try {
        const memories = await memoriesService.getFavorites(user.id);
        return { success: true, data: memories };
      } catch (error) {
        return handleError(error, set, { userId: user.id, operation: "memories.getFavorites" });
      }
    },
    {
      detail: {
        tags: ["memories"],
        summary: "Get favorite memories",
        description: "Get all memories marked as favorite",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Get all tags
  .get(
    "/tags",
    async ({ user, set }) => {
      try {
        const tags = await memoriesService.getAllTags(user.id);
        return { success: true, data: tags };
      } catch (error) {
        return handleError(error, set, { userId: user.id, operation: "memories.getAllTags" });
      }
    },
    {
      detail: {
        tags: ["memories"],
        summary: "Get all tags",
        description: "Get all unique tags used in memories",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Get single memory
  .get(
    "/:id",
    async ({ user, params, set }) => {
      try {
        const memory = await memoriesService.getById(user.id, params.id);
        if (!memory) {
          set.status = 404;
          return { success: false, error: "Memory not found" };
        }
        return { success: true, data: memory };
      } catch (error) {
        return handleError(error, set, { userId: user.id, operation: "memories.getById" });
      }
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        tags: ["memories"],
        summary: "Get memory by ID",
        description: "Get a specific memory by ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Create memory
  .post(
    "/",
    async ({ user, body, set }) => {
      try {
        const memory = await memoriesService.create({
          user_id: user.id,
          person_id: body.person_id,
          title: body.title,
          description: body.description,
          date: body.date ? new Date(body.date) : null,
          media_urls: body.media_urls,
          tags: body.tags,
          location: body.location,
          is_favorite: body.is_favorite || false,
        });
        set.status = 201;
        return { success: true, data: memory };
      } catch (error) {
        return handleError(error, set, { userId: user.id, operation: "memories.create" });
      }
    },
    {
      body: t.Object({
        person_id: t.Optional(t.String()),
        title: t.String({ minLength: 1 }),
        description: t.Optional(t.String()),
        date: t.Optional(t.String()),
        media_urls: t.Optional(t.Array(t.String())),
        tags: t.Optional(t.Array(t.String())),
        location: t.Optional(t.String()),
        is_favorite: t.Optional(t.Boolean()),
      }),
      detail: {
        tags: ["memories"],
        summary: "Create memory",
        description: "Create a new memory",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Update memory
  .patch(
    "/:id",
    async ({ user, params, body, set }) => {
      try {
        const memory = await memoriesService.update(user.id, params.id, {
          person_id: body.person_id,
          title: body.title,
          description: body.description,
          date: body.date ? new Date(body.date) : undefined,
          media_urls: body.media_urls,
          tags: body.tags,
          location: body.location,
          is_favorite: body.is_favorite,
        });
        if (!memory) {
          set.status = 404;
          return { success: false, error: "Memory not found" };
        }
        return { success: true, data: memory };
      } catch (error) {
        return handleError(error, set, { userId: user.id, operation: "memories.update" });
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
        date: t.Optional(t.String()),
        media_urls: t.Optional(t.Array(t.String())),
        tags: t.Optional(t.Array(t.String())),
        location: t.Optional(t.String()),
        is_favorite: t.Optional(t.Boolean()),
      }),
      detail: {
        tags: ["memories"],
        summary: "Update memory",
        description: "Update an existing memory",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Toggle favorite
  .post(
    "/:id/favorite",
    async ({ user, params, set }) => {
      try {
        const memory = await memoriesService.toggleFavorite(user.id, params.id);
        if (!memory) {
          set.status = 404;
          return { success: false, error: "Memory not found" };
        }
        return { success: true, data: memory };
      } catch (error) {
        return handleError(error, set, { userId: user.id, operation: "memories.toggleFavorite" });
      }
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        tags: ["memories"],
        summary: "Toggle favorite",
        description: "Toggle the favorite status of a memory",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Upload media
  .post(
    "/:id/media",
    async ({ user, params, body, set }) => {
      try {
        const file = body.file;
        if (!file) {
          set.status = 400;
          return { success: false, error: "No file provided" };
        }

        const url = await memoriesService.uploadMedia(user.id, params.id, file);
        if (!url) {
          set.status = 404;
          return { success: false, error: "Memory not found or upload failed" };
        }

        return { success: true, data: { url } };
      } catch (error) {
        return handleError(error, set, { userId: user.id, operation: "memories.uploadMedia" });
      }
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        file: t.File(),
      }),
      detail: {
        tags: ["memories"],
        summary: "Upload media",
        description: "Upload a media file to a memory",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Remove media
  .delete(
    "/:id/media",
    async ({ user, params, body, set }) => {
      try {
        const success = await memoriesService.removeMedia(user.id, params.id, body.url);
        if (!success) {
          set.status = 404;
          return { success: false, error: "Memory not found" };
        }
        return { success: true };
      } catch (error) {
        return handleError(error, set, { userId: user.id, operation: "memories.removeMedia" });
      }
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        url: t.String(),
      }),
      detail: {
        tags: ["memories"],
        summary: "Remove media",
        description: "Remove a media file from a memory",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Delete memory
  .delete(
    "/:id",
    async ({ user, params, set }) => {
      try {
        const deleted = await memoriesService.delete(user.id, params.id);
        if (!deleted) {
          set.status = 404;
          return { success: false, error: "Memory not found" };
        }
        set.status = 204;
        return null;
      } catch (error) {
        return handleError(error, set, { userId: user.id, operation: "memories.delete" });
      }
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        tags: ["memories"],
        summary: "Delete memory",
        description: "Delete a memory and its associated media files",
        security: [{ bearerAuth: [] }],
      },
    }
  );

