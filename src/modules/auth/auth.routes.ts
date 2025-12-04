import { Elysia, t } from "elysia";
import { authMiddleware, type AuthUser } from "./auth.middleware";
import { db } from "../../libs/db/client";
import { sql } from "kysely";
import { supabase, supabaseAnon } from "../../libs/supabase";
import { sendEmail, isEmailEnabled } from "../../libs/email";
import { redis } from "../../libs/cache";
import {
  signupRateLimit,
  loginRateLimit,
  oauthRateLimit,
  passwordResetRateLimit,
  otpVerifyRateLimit,
} from "../../middlewares/rateLimit";
import { logger } from "@/libs/logger";

/**
 * Sync user to local database
 * - On ID conflict: update existing record
 * - On email conflict: skip (another user owns this email)
 */
async function syncUserToDatabase(user: {
  id: string;
  email: string;
  name?: string | null;
  avatar_url?: string | null;
}): Promise<void> {
  try {
    // Check if email is already taken by another user
    const existingByEmail = await db
      .selectFrom("users")
      .select("id")
      .where("email", "=", user.email)
      .where("id", "!=", user.id)
      .executeTakeFirst();
    if (existingByEmail) {
      logger.warn("Email already exists for different user, skipping sync", {
        userId: user.id,
        email: user.email,
        existingUserId: existingByEmail.id,
      });
      return;
    }
    // Upsert user by ID
    await db
      .insertInto("users")
      .values({
        id: user.id,
        email: user.email,
        name: user.name || null,
        avatar_url: user.avatar_url || null,
      })
      .onConflict((oc) => oc.column("id").doUpdateSet({
        email: user.email,
        name: user.name || null,
        avatar_url: user.avatar_url || null,
      }))
      .execute();
    logger.info("User synced to database", { userId: user.id });
  } catch (error) {
    logger.error("Failed to sync user to database", error as Error, { 
      userId: user.id,
      email: user.email,
    });
  }
}

// Signup routes (rate limited: 5/hour per IP)
const signupRoutes = new Elysia()
  .use(signupRateLimit)
  .post(
    "/signup",
    async ({ body, set }) => {
      // Check if email already exists in database
      const existingUser = await db
        .selectFrom("users")
        .select("id")
        .where("email", "=", body.email)
        .executeTakeFirst();
      if (existingUser) {
        set.status = 409;
        return {
          success: false,
          error: "User with this email already exists",
        };
      }
      // Use admin API to create user with email pre-confirmed (skips verification)
      // This will also fail if email exists in Supabase Auth
      const { data: userData, error: createError } = await supabase.auth.admin.createUser({
        email: body.email,
        password: body.password,
        email_confirm: true, // Skip email verification
        user_metadata: {
          full_name: body.name,
        },
      });
      if (createError) {
        // Check if it's a duplicate email error from Supabase
        const isDuplicateEmail = createError.message.toLowerCase().includes("already") || 
                                  createError.message.toLowerCase().includes("exists");
        set.status = isDuplicateEmail ? 409 : 400;
        return {
          success: false,
          error: isDuplicateEmail ? "User with this email already exists" : createError.message,
        };
      }

      // Generate session for the new user
      const { data: sessionData, error: sessionError } = await supabaseAnon.auth.signInWithPassword({
        email: body.email,
        password: body.password,
      });

      if (sessionError) {
        set.status = 500;
        return {
          success: false,
          error: "Account created but failed to generate session. Please sign in manually.",
        };
      }

      // Sync user to database
      await syncUserToDatabase({
        id: userData.user.id,
        email: userData.user.email!,
        name: body.name,
      });
      
      set.status = 201;
      return {
        success: true,
        data: {
          user: sessionData.user,
          session: sessionData.session,
        },
        message: "Account created successfully.",
      };
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        password: t.String({ minLength: 6 }),
        name: t.Optional(t.String()),
      }),
      detail: {
        tags: ["auth"],
        summary: "Sign up with email",
        description: "Create a new account using email and password. Rate limited: 5 signups per hour per IP.",
      },
    }
  );

// Login routes (rate limited: 5 attempts per 15 minutes per IP)
const loginRoutes = new Elysia()
  .use(loginRateLimit)
  .post(
    "/signin",
    async ({ body, set }) => {
      const { data, error } = await supabaseAnon.auth.signInWithPassword({
        email: body.email,
        password: body.password,
      });

      if (error) {
        set.status = 401;
        return {
          success: false,
          error: error.message,
        };
      }
      return {
        success: true,
        data: {
          user: data.user,
          session: data.session,
        },
      };
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        password: t.String(),
      }),
      detail: {
        tags: ["auth"],
        summary: "Sign in with email",
        description: "Sign in using email and password. Rate limited: 5 attempts per 15 minutes per IP.",
      },
    }
  );

// OAuth routes (rate limited: 10 attempts per 15 minutes per IP)
const oauthRoutes = new Elysia()
  .use(oauthRateLimit)
  .post(
    "/signin/oauth",
    async ({ body, set }) => {
      const { data, error } = await supabaseAnon.auth.signInWithOAuth({
        provider: body.provider,
        options: {
          redirectTo: body.redirectTo,
          scopes: body.provider === "google" ? "email profile" : undefined,
        },
      });

      if (error) {
        set.status = 400;
        return {
          success: false,
          error: error.message,
        };
      }

      return {
        success: true,
        data: {
          url: data.url,
          provider: data.provider,
        },
        message: "Redirect to provider for authentication",
      };
    },
    {
      body: t.Object({
        provider: t.Union([t.Literal("google"), t.Literal("apple")]),
        redirectTo: t.Optional(t.String()),
      }),
      detail: {
        tags: ["auth"],
        summary: "Sign in with OAuth",
        description: "Initiate OAuth sign-in with Google or Apple. Rate limited: 10 attempts per 15 minutes per IP.",
      },
    }
  )
  .post(
    "/callback",
    async ({ body, set }) => {
      const { data, error } = await supabaseAnon.auth.exchangeCodeForSession(body.code);

      if (error) {
        set.status = 400;
        return {
          success: false,
          error: error.message,
        };
      }

      // Sync user to our database
      if (data.user) {
        await syncUserToDatabase({
          id: data.user.id,
          email: data.user.email!,
          name: data.user.user_metadata?.full_name || data.user.user_metadata?.name,
          avatar_url: data.user.user_metadata?.avatar_url || data.user.user_metadata?.picture,
        });
      }

      return {
        success: true,
        data: {
          user: data.user,
          session: data.session,
        },
      };
    },
    {
      body: t.Object({
        code: t.String(),
      }),
      detail: {
        tags: ["auth"],
        summary: "OAuth callback",
        description: "Exchange OAuth code for session (server-side flow)",
      },
    }
  );

// Password reset request routes (rate limited: 3 per hour per IP)
const forgotPasswordRoutes = new Elysia()
  .use(passwordResetRateLimit)
  .post(
    "/forgot-password",
    async ({ body, set }) => {
      try {
        // Use Supabase Auth built-in password reset
        const { error } = await supabaseAnon.auth.resetPasswordForEmail(body.email, {
          redirectTo: body.redirectTo,
        });
        if (error) {
          logger.error("Failed to send password reset email", error, { email: body.email });
          set.status = 500;
          return {
            success: false,
            error: "Failed to send reset email. Please try again later.",
          };
        }
        // Always return success to prevent email enumeration
        return {
          success: true,
          message: "If an account exists with this email, you will receive a password reset link.",
        };
      } catch (error) {
        logger.error("Password reset request failed", error as Error, { email: body.email });
        set.status = 500;
        return {
          success: false,
          error: "Failed to process reset request. Please try again later.",
        };
      }
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        redirectTo: t.Optional(t.String({ description: "URL to redirect after password reset" })),
      }),
      detail: {
        tags: ["auth"],
        summary: "Request password reset",
        description: "Send a password reset link to the user's email using Supabase Auth. Rate limited: 3 requests per hour per IP.",
      },
    }
  );

// Password reset routes (rate limited: 5 attempts per 15 minutes per IP)
const resetPasswordRoutes = new Elysia()
  .use(otpVerifyRateLimit)
  .post(
    "/reset-password",
    async ({ body, set }) => {
      try {
        // Verify the recovery token and update password
        const { data, error: sessionError } = await supabaseAnon.auth.verifyOtp({
          token_hash: body.token,
          type: "recovery",
        });
        if (sessionError || !data.user) {
          set.status = 400;
          return {
            success: false,
            error: "Invalid or expired reset token. Please request a new one.",
          };
        }
        // Update password using admin API
        const { error: updateError } = await supabase.auth.admin.updateUserById(data.user.id, {
          password: body.new_password,
        });
        if (updateError) {
          logger.error("Failed to update password", updateError, { userId: data.user.id });
          set.status = 500;
          return {
            success: false,
            error: "Failed to reset password. Please try again.",
          };
        }
        logger.info("Password reset successfully", { userId: data.user.id });
        return {
          success: true,
          message: "Password reset successfully. You can now sign in with your new password.",
        };
      } catch (error) {
        logger.error("Password reset failed", error as Error);
        set.status = 500;
        return {
          success: false,
          error: "Failed to reset password. Please try again.",
        };
      }
    },
    {
      body: t.Object({
        token: t.String({ description: "Recovery token from the password reset email link" }),
        new_password: t.String({ minLength: 6 }),
      }),
      detail: {
        tags: ["auth"],
        summary: "Reset password with token",
        description: "Verify the recovery token from email and set a new password. Rate limited: 5 attempts per 15 minutes per IP.",
      },
    }
  );

// Logout (no rate limit needed, requires auth token)
const logoutRoutes = new Elysia().post(
  "/logout",
  async ({ request, set }) => {
    const authHeader = request.headers.get("authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      set.status = 401;
      return {
        success: false,
        error: "No authorization header provided",
      };
    }

    const token = authHeader.replace("Bearer ", "");

    // Sign out the user (invalidates the token)
    const { error } = await supabaseAnon.auth.admin.signOut(token);

    if (error) {
      set.status = 400;
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      message: "Logged out successfully",
    };
  },
  {
    detail: {
      tags: ["auth"],
      summary: "Logout",
      description: "Sign out the current user and invalidate their session",
      security: [{ bearerAuth: [] }],
    },
  }
);

// Cache constants
const USER_CACHE_TTL = 300; // 5 minutes
const getUserCacheKey = (userId: string): string => `user:profile:${userId}`;

// Protected routes (require authentication)
const protectedRoutes = new Elysia()
  .use(authMiddleware)
  .get(
    "/me",
    async ({ user, set }: { user: AuthUser; set: { status: number } }) => {
      try {
        // Try cache first
        const cacheKey = getUserCacheKey(user.id);
        const cached = await redis.get(cacheKey);
        if (cached) {
          logger.info("User fetched from cache", { userId: user.id });
          return {
            success: true,
            data: JSON.parse(cached),
          };
        }
        // Fetch from database
        const dbUser = await db.selectFrom("users").selectAll().where("id", "=", user.id).executeTakeFirst();
        if (!dbUser) {
          set.status = 404;
          return {
            success: false,
            error: "User not found",
          };
        }
        // Cache the result
        await redis.setex(cacheKey, USER_CACHE_TTL, JSON.stringify(dbUser));
        logger.info("User fetched from database", { userId: user.id });
        return {
          success: true,
          data: dbUser,
        };
      } catch (error) {
        logger.error("Failed to fetch user profile", error as Error, { userId: user.id });
        set.status = 500;
        return {
          success: false,
          error: "Failed to fetch user profile",
        };
      }
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
  .patch(
    "/me",
    async ({ user, body, set }: { user: AuthUser; body: { name?: string; avatar_url?: string }; set: { status: number } }) => {
      try {
        const updatedUser = await db
          .updateTable("users")
          .set({
            name: body.name,
            avatar_url: body.avatar_url,
          })
          .where("id", "=", user.id)
          .returningAll()
          .executeTakeFirst();
        if (!updatedUser) {
          set.status = 404;
          return {
            success: false,
            error: "User not found",
          };
        }
        // Invalidate cache
        const cacheKey = getUserCacheKey(user.id);
        await redis.del(cacheKey);
        logger.info("User profile updated", { userId: user.id });
        return {
          success: true,
          data: updatedUser,
        };
      } catch (error) {
        logger.error("Failed to update user profile", error as Error, { userId: user.id });
        set.status = 500;
        return {
          success: false,
          error: "Failed to update user profile",
        };
      }
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
  .delete(
    "/me",
    async ({ user, set }: { user: AuthUser; set: { status: number } }) => {
      try {
        // Delete all user data in a single atomic query using CTEs
        await sql`
          WITH delete_memories AS (
            DELETE FROM memories WHERE user_id = ${user.id}
          ),
          delete_planner AS (
            DELETE FROM planner WHERE user_id = ${user.id}
          ),
          delete_wishlist AS (
            DELETE FROM wishlist WHERE user_id = ${user.id}
          ),
          delete_people AS (
            DELETE FROM people WHERE user_id = ${user.id}
          ),
          delete_feedback AS (
            DELETE FROM feedback WHERE user_id = ${user.id}
          )
          DELETE FROM users WHERE id = ${user.id}
        `.execute(db);
        // Delete user from Supabase Auth
        const { error: authError } = await supabase.auth.admin.deleteUser(user.id);
        if (authError) {
          logger.error("Failed to delete user from auth", authError, { userId: user.id });
        }
        // Invalidate all user caches
        const cacheKeys = await redis.keys(`*:*:${user.id}*`);
        if (cacheKeys.length > 0) {
          await redis.del(...cacheKeys);
        }
        await redis.del(getUserCacheKey(user.id));
        logger.info("User account fully deleted", { userId: user.id });
        set.status = 204;
        return {
          success: true,
          message: "User account deleted successfully",
        };
      } catch (error) {
        logger.error("Failed to delete user account", error as Error, { userId: user.id });
        set.status = 500;
        return {
          success: false,
          error: "Failed to delete account",
        };
      }
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

// Combine all auth routes
export const authRoutes = new Elysia({ prefix: "/auth" })
  .use(signupRoutes)
  .use(loginRoutes)
  .use(oauthRoutes)
  .use(forgotPasswordRoutes)
  .use(resetPasswordRoutes)
  .use(logoutRoutes)
  .use(protectedRoutes);
