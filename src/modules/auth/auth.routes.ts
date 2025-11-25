import { Elysia, t } from "elysia";
import { authMiddleware, type AuthUser } from "./auth.middleware";
import { db } from "../../libs/db/client";

export const authRoutes = new Elysia({ prefix: "/auth" })
  // Get current user profile
  .use(authMiddleware)
  .get(
    "/me",
    async ({ user }) => {
      const dbUser = await db
        .selectFrom("users")
        .selectAll()
        .where("id", "=", user.id)
        .executeTakeFirst();

      return {
        success: true,
        data: dbUser,
      };
    },
    {
      detail: {
        tags: ["auth"],
        summary: "Get current user",
        description: "Returns the authenticated user profile",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Update current user profile
  .patch(
    "/me",
    async ({ user, body }) => {
      const updatedUser = await db
        .updateTable("users")
        .set({
          name: body.name,
          avatar_url: body.avatar_url,
        })
        .where("id", "=", user.id)
        .returningAll()
        .executeTakeFirst();

      return {
        success: true,
        data: updatedUser,
      };
    },
    {
      body: t.Object({
        name: t.Optional(t.String()),
        avatar_url: t.Optional(t.String()),
      }),
      detail: {
        tags: ["auth"],
        summary: "Update current user",
        description: "Update the authenticated user profile",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Delete account
  .delete(
    "/me",
    async ({ user, set }) => {
      // This will cascade delete all related data
      await db.deleteFrom("users").where("id", "=", user.id).execute();

      set.status = 204;
      return null;
    },
    {
      detail: {
        tags: ["auth"],
        summary: "Delete account",
        description: "Delete the authenticated user account and all associated data",
        security: [{ bearerAuth: [] }],
      },
    }
  );

