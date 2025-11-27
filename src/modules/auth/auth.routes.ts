import { Elysia, t } from "elysia";
import { authMiddleware, type AuthUser } from "./auth.middleware";
import { db } from "../../libs/db/client";
import { supabaseAnon } from "../../libs/supabase";
import { sendEmail, isEmailEnabled } from "../../libs/email";
import { redis } from "../../libs/cache";
import {
  signupRateLimit,
  loginRateLimit,
  oauthRateLimit,
  passwordResetRateLimit,
  otpVerifyRateLimit,
} from "../../middlewares/rateLimit";

// Signup routes (rate limited: 5/hour per IP)
const signupRoutes = new Elysia()
  .use(signupRateLimit)
  .post(
    "/signup",
    async ({ body, set }) => {
      const { data, error } = await supabaseAnon.auth.signUp({
        email: body.email,
        password: body.password,
        options: {
          data: {
            full_name: body.name,
          },
        },
      });

      if (error) {
        set.status = 400;
        return {
          success: false,
          error: error.message,
        };
      }

      // If user was created, sync to our database
      if (data.user) {
        await db
          .insertInto("users")
          .values({
            id: data.user.id,
            email: data.user.email!,
            name: body.name || null,
          })
          .onConflict((oc) => oc.column("id").doNothing())
          .execute();
      }

      return {
        success: true,
        data: {
          user: data.user,
          session: data.session,
        },
        message: "Account created successfully. Please check your email to verify your account.",
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

      // Sync user to our database if not exists
      if (data.user) {
        await db
          .insertInto("users")
          .values({
            id: data.user.id,
            email: data.user.email!,
            name: data.user.user_metadata?.full_name || data.user.user_metadata?.name || null,
            avatar_url: data.user.user_metadata?.avatar_url || null,
          })
          .onConflict((oc) => oc.column("id").doNothing())
          .execute();
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
        await db
          .insertInto("users")
          .values({
            id: data.user.id,
            email: data.user.email!,
            name: data.user.user_metadata?.full_name || data.user.user_metadata?.name || null,
            avatar_url: data.user.user_metadata?.avatar_url || data.user.user_metadata?.picture || null,
          })
          .onConflict((oc) =>
            oc.column("id").doUpdateSet({
              name: (eb) => eb.ref("excluded.name"),
              avatar_url: (eb) => eb.ref("excluded.avatar_url"),
            })
          )
          .execute();
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
      // Check if email service is enabled
      if (!isEmailEnabled()) {
        set.status = 503;
        return {
          success: false,
          error: "Email service is not configured. Please contact support.",
        };
      }

      // Check if user exists in our database
      const user = await db
        .selectFrom("users")
        .select(["id", "email", "name"])
        .where("email", "=", body.email)
        .executeTakeFirst();

      // For security, always return success even if user doesn't exist
      // This prevents email enumeration attacks
      if (!user) {
        return {
          success: true,
          message: "If an account exists with this email, you will receive a password reset code.",
        };
      }

      // Generate 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();

      // Store OTP in Redis with 10-minute expiration
      const otpKey = `otp:${user.email}`;
      await redis.setex(otpKey, 600, otp); // 600 seconds = 10 minutes

      // Send OTP via email
      try {
        await sendEmail({
          to: user.email,
          subject: "Reset Your Amori Password",
          html: `
            <!DOCTYPE html>
            <html>
              <head>
                <style>
                  body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                  .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                  .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                  .otp-box { background: white; border: 2px dashed #667eea; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
                  .otp-code { font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #667eea; }
                  .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
                </style>
              </head>
              <body>
                <div class="container">
                  <div class="header">
                    <h1>🩷 Amori</h1>
                    <p>Password Reset Request</p>
                  </div>
                  <div class="content">
                    <p>Hi ${user.name || "there"},</p>
                    <p>We received a request to reset your password. Use the code below to reset your password:</p>
                    <div class="otp-box">
                      <div class="otp-code">${otp}</div>
                    </div>
                    <p><strong>This code will expire in 10 minutes.</strong></p>
                    <p>If you didn't request this password reset, please ignore this email. Your password will remain unchanged.</p>
                    <div class="footer">
                      <p>This is an automated message from Amori. Please do not reply to this email.</p>
                    </div>
                  </div>
                </div>
              </body>
            </html>
          `,
          text: `Hi ${user.name || "there"},\n\nYour password reset code is: ${otp}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this, please ignore this email.`,
        });

        return {
          success: true,
          message: "If an account exists with this email, you will receive a password reset code.",
        };
      } catch (error) {
        // Delete the OTP if email fails to send
        await redis.del(otpKey);

        set.status = 500;
        return {
          success: false,
          error: "Failed to send reset code. Please try again later.",
        };
      }
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
      }),
      detail: {
        tags: ["auth"],
        summary: "Request password reset",
        description: "Send a 6-digit OTP code to the user's email. Rate limited: 3 requests per hour per IP.",
      },
    }
  );

// OTP verification routes (rate limited: 5 attempts per 15 minutes per IP)
const resetPasswordRoutes = new Elysia()
  .use(otpVerifyRateLimit)
  .post(
    "/reset-password",
    async ({ body, set }) => {
      // Retrieve OTP from Redis
      const otpKey = `otp:${body.email}`;
      const storedOtp = await redis.get(otpKey);

      if (!storedOtp) {
        set.status = 400;
        return {
          success: false,
          error: "Invalid or expired reset code. Please request a new one.",
        };
      }

      // Verify OTP
      if (storedOtp !== body.otp) {
        set.status = 400;
        return {
          success: false,
          error: "Invalid reset code. Please check and try again.",
        };
      }

      // Get user from database
      const user = await db
        .selectFrom("users")
        .select(["id", "email"])
        .where("email", "=", body.email)
        .executeTakeFirst();

      if (!user) {
        set.status = 404;
        return {
          success: false,
          error: "User not found.",
        };
      }

      // Update password in Supabase Auth
      const { error } = await supabaseAnon.auth.admin.updateUserById(user.id, {
        password: body.new_password,
      });

      if (error) {
        set.status = 500;
        return {
          success: false,
          error: "Failed to reset password. Please try again.",
        };
      }

      // Delete the used OTP
      await redis.del(otpKey);

      return {
        success: true,
        message: "Password reset successfully. You can now sign in with your new password.",
      };
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        otp: t.String({ minLength: 6, maxLength: 6 }),
        new_password: t.String({ minLength: 6 }),
      }),
      detail: {
        tags: ["auth"],
        summary: "Reset password with OTP",
        description: "Verify the OTP code and set a new password. Rate limited: 5 attempts per 15 minutes per IP.",
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

// Protected routes (require authentication)
const protectedRoutes = new Elysia()
  .use(authMiddleware)
  .get(
    "/me",
    async ({ user }: { user: AuthUser }) => {
      const dbUser = await db.selectFrom("users").selectAll().where("id", "=", user.id).executeTakeFirst();

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
  .patch(
    "/me",
    async ({ user, body }: { user: AuthUser; body: { name?: string; avatar_url?: string } }) => {
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
  .delete(
    "/me",
    async ({ user, set }: { user: AuthUser; set: { status: number } }) => {
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

// Combine all auth routes
export const authRoutes = new Elysia({ prefix: "/auth" })
  .use(signupRoutes)
  .use(loginRoutes)
  .use(oauthRoutes)
  .use(forgotPasswordRoutes)
  .use(resetPasswordRoutes)
  .use(logoutRoutes)
  .use(protectedRoutes);
