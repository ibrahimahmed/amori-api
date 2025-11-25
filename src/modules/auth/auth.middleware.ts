import { Elysia } from "elysia";
import { verifyToken } from "../../libs/supabase";
import { db } from "../../libs/db/client";
import type { User } from "@supabase/supabase-js";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
}

/**
 * Auth middleware that validates Supabase JWT tokens
 * and attaches the user to the request context
 */
export const authMiddleware = new Elysia({ name: "auth" }).derive(
  async ({ request, set }): Promise<{ user: AuthUser }> => {
    const authHeader = request.headers.get("authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      set.status = 401;
      throw new Error("Unauthorized: Missing or invalid authorization header");
    }

    const token = authHeader.replace("Bearer ", "");

    const supabaseUser = await verifyToken(token);

    if (!supabaseUser) {
      set.status = 401;
      throw new Error("Unauthorized: Invalid token");
    }

    // Ensure user exists in our database
    let dbUser = await db
      .selectFrom("users")
      .selectAll()
      .where("id", "=", supabaseUser.id)
      .executeTakeFirst();

    if (!dbUser) {
      // Create user in our database (first-time sync from Supabase Auth)
      const newUser = await db
        .insertInto("users")
        .values({
          id: supabaseUser.id,
          email: supabaseUser.email!,
          name: supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name || null,
          avatar_url: supabaseUser.user_metadata?.avatar_url || null,
        })
        .returningAll()
        .executeTakeFirst();

      dbUser = newUser;
    }

    return {
      user: {
        id: dbUser!.id,
        email: dbUser!.email,
        name: dbUser!.name,
        avatar_url: dbUser!.avatar_url,
      },
    };
  }
);

/**
 * Optional auth middleware - doesn't fail if no token provided
 * but will attach user if valid token exists
 */
export const optionalAuthMiddleware = new Elysia({ name: "optionalAuth" }).derive(
  async ({ request }): Promise<{ user: AuthUser | null }> => {
    const authHeader = request.headers.get("authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return { user: null };
    }

    const token = authHeader.replace("Bearer ", "");

    try {
      const supabaseUser = await verifyToken(token);

      if (!supabaseUser) {
        return { user: null };
      }

      const dbUser = await db
        .selectFrom("users")
        .selectAll()
        .where("id", "=", supabaseUser.id)
        .executeTakeFirst();

      if (!dbUser) {
        return { user: null };
      }

      return {
        user: {
          id: dbUser.id,
          email: dbUser.email,
          name: dbUser.name,
          avatar_url: dbUser.avatar_url,
        },
      };
    } catch {
      return { user: null };
    }
  }
);

