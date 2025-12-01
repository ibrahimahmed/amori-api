import { Elysia, t } from "elysia";
import { authMiddleware } from "../auth";
import { feedbackService, ServiceError } from "./feedback.service";
import type { FeedbackType, FeedbackStatus, FeedbackPriority } from "../../libs/db/schema";
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

/**
 * Feedback type validation values
 */
const FEEDBACK_TYPES = ["bug_report", "feedback", "feature_request"] as const;
const FEEDBACK_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
const FEEDBACK_PRIORITIES = ["low", "medium", "high", "critical"] as const;

export const feedbackRoutes = new Elysia({ prefix: "/feedback" })
  .use(generalRateLimit)
  // Public endpoint - Submit feedback (can be anonymous or authenticated)
  .post(
    "/",
    async ({ body, set }) => {
      try {
        // Validate type
        if (!FEEDBACK_TYPES.includes(body.type as any)) {
          set.status = 400;
          return { success: false, error: "Invalid feedback type. Must be: bug_report, feedback, or feature_request" };
        }

        // Validate priority if provided
        if (body.priority && !FEEDBACK_PRIORITIES.includes(body.priority as any)) {
          set.status = 400;
          return { success: false, error: "Invalid priority. Must be: low, medium, high, or critical" };
        }

        const feedback = await feedbackService.create({
          user_id: body.user_id || null,
          type: body.type as FeedbackType,
          subject: body.subject,
          message: body.message,
          contact_email: body.contact_email,
          priority: body.priority as FeedbackPriority | undefined,
          screenshot_url: body.screenshot_url,
          device_info: body.device_info,
          app_version: body.app_version,
        }, body.user_name);

        set.status = 201;
        return {
          success: true,
          data: feedback,
          message: "Thank you for your feedback! Our team will review it shortly.",
        };
      } catch (error) {
        return handleError(error, set, { operation: "feedback.create" });
      }
    },
    {
      body: t.Object({
        type: t.String({ minLength: 1 }),
        subject: t.String({ minLength: 1, maxLength: 200 }),
        message: t.String({ minLength: 10, maxLength: 5000 }),
        user_id: t.Optional(t.String()),
        user_name: t.Optional(t.String()),
        contact_email: t.Optional(t.String({ format: "email" })),
        priority: t.Optional(t.String()),
        screenshot_url: t.Optional(t.String()),
        device_info: t.Optional(t.String({ maxLength: 500 })),
        app_version: t.Optional(t.String({ maxLength: 50 })),
      }),
      detail: {
        tags: ["feedback"],
        summary: "Submit feedback",
        description: "Submit a bug report, feature request, or general feedback. Can be submitted anonymously or with user information.",
      },
    }
  )
  // Apply auth middleware for protected routes
  .use(authMiddleware)
  // Get current user's feedback submissions
  .get(
    "/my",
    async ({ user, set }) => {
      try {
        const feedbacks = await feedbackService.getByUserId(user.id);
        return { success: true, data: feedbacks };
      } catch (error) {
        return handleError(error, set, { userId: user.id, operation: "feedback.getMyFeedback" });
      }
    },
    {
      detail: {
        tags: ["feedback"],
        summary: "Get my feedback",
        description: "Get all feedback submissions by the current user",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Submit feedback as authenticated user
  .post(
    "/submit",
    async ({ user, body, set }) => {
      try {
        // Validate type
        if (!FEEDBACK_TYPES.includes(body.type as any)) {
          set.status = 400;
          return { success: false, error: "Invalid feedback type. Must be: bug_report, feedback, or feature_request" };
        }

        // Validate priority if provided
        if (body.priority && !FEEDBACK_PRIORITIES.includes(body.priority as any)) {
          set.status = 400;
          return { success: false, error: "Invalid priority. Must be: low, medium, high, or critical" };
        }

        const feedback = await feedbackService.create({
          user_id: user.id,
          type: body.type as FeedbackType,
          subject: body.subject,
          message: body.message,
          contact_email: body.contact_email || user.email,
          priority: body.priority as FeedbackPriority | undefined,
          screenshot_url: body.screenshot_url,
          device_info: body.device_info,
          app_version: body.app_version,
        }, user.name || undefined);

        set.status = 201;
        return {
          success: true,
          data: feedback,
          message: "Thank you for your feedback! Our team will review it shortly.",
        };
      } catch (error) {
        return handleError(error, set, { userId: user.id, operation: "feedback.submitAuthenticated" });
      }
    },
    {
      body: t.Object({
        type: t.String({ minLength: 1 }),
        subject: t.String({ minLength: 1, maxLength: 200 }),
        message: t.String({ minLength: 10, maxLength: 5000 }),
        contact_email: t.Optional(t.String({ format: "email" })),
        priority: t.Optional(t.String()),
        screenshot_url: t.Optional(t.String()),
        device_info: t.Optional(t.String({ maxLength: 500 })),
        app_version: t.Optional(t.String({ maxLength: 50 })),
      }),
      detail: {
        tags: ["feedback"],
        summary: "Submit feedback (authenticated)",
        description: "Submit a bug report, feature request, or general feedback as an authenticated user",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Admin routes - Get all feedback
  .get(
    "/admin/all",
    async ({ query, set }) => {
      try {
        // Validate filters if provided
        if (query.type && !FEEDBACK_TYPES.includes(query.type as any)) {
          set.status = 400;
          return { success: false, error: "Invalid type filter" };
        }
        if (query.status && !FEEDBACK_STATUSES.includes(query.status as any)) {
          set.status = 400;
          return { success: false, error: "Invalid status filter" };
        }
        if (query.priority && !FEEDBACK_PRIORITIES.includes(query.priority as any)) {
          set.status = 400;
          return { success: false, error: "Invalid priority filter" };
        }

        const feedbacks = await feedbackService.getAll({
          type: query.type as FeedbackType | undefined,
          status: query.status as FeedbackStatus | undefined,
          priority: query.priority as FeedbackPriority | undefined,
        });
        return { success: true, data: feedbacks };
      } catch (error) {
        return handleError(error, set, { operation: "feedback.getAllAdmin" });
      }
    },
    {
      query: t.Object({
        type: t.Optional(t.String()),
        status: t.Optional(t.String()),
        priority: t.Optional(t.String()),
      }),
      detail: {
        tags: ["feedback"],
        summary: "Get all feedback (admin)",
        description: "Get all feedback with optional filters. Admin endpoint.",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Admin - Get feedback statistics
  .get(
    "/admin/stats",
    async ({ set }) => {
      try {
        const stats = await feedbackService.getStatistics();
        return { success: true, data: stats };
      } catch (error) {
        return handleError(error, set, { operation: "feedback.getStats" });
      }
    },
    {
      detail: {
        tags: ["feedback"],
        summary: "Get feedback statistics (admin)",
        description: "Get aggregated feedback statistics. Admin endpoint.",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Admin - Get single feedback by ID
  .get(
    "/admin/:id",
    async ({ params, set }) => {
      try {
        const feedback = await feedbackService.getById(params.id);
        if (!feedback) {
          set.status = 404;
          return { success: false, error: "Feedback not found" };
        }
        return { success: true, data: feedback };
      } catch (error) {
        return handleError(error, set, { operation: "feedback.getByIdAdmin" });
      }
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        tags: ["feedback"],
        summary: "Get feedback by ID (admin)",
        description: "Get a specific feedback entry. Admin endpoint.",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Admin - Update feedback status/notes
  .patch(
    "/admin/:id",
    async ({ params, body, set }) => {
      try {
        // Validate status if provided
        if (body.status && !FEEDBACK_STATUSES.includes(body.status as any)) {
          set.status = 400;
          return { success: false, error: "Invalid status" };
        }
        // Validate priority if provided
        if (body.priority && !FEEDBACK_PRIORITIES.includes(body.priority as any)) {
          set.status = 400;
          return { success: false, error: "Invalid priority" };
        }

        const feedback = await feedbackService.update(params.id, {
          status: body.status as FeedbackStatus | undefined,
          priority: body.priority as FeedbackPriority | undefined,
          admin_notes: body.admin_notes,
        });

        if (!feedback) {
          set.status = 404;
          return { success: false, error: "Feedback not found" };
        }
        return { success: true, data: feedback };
      } catch (error) {
        return handleError(error, set, { operation: "feedback.updateAdmin" });
      }
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        status: t.Optional(t.String()),
        priority: t.Optional(t.String()),
        admin_notes: t.Optional(t.String({ maxLength: 2000 })),
      }),
      detail: {
        tags: ["feedback"],
        summary: "Update feedback (admin)",
        description: "Update feedback status, priority, or add admin notes. Admin endpoint.",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Admin - Delete feedback
  .delete(
    "/admin/:id",
    async ({ params, set }) => {
      try {
        const deleted = await feedbackService.delete(params.id);
        if (!deleted) {
          set.status = 404;
          return { success: false, error: "Feedback not found" };
        }
        set.status = 204;
        return null;
      } catch (error) {
        return handleError(error, set, { operation: "feedback.deleteAdmin" });
      }
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        tags: ["feedback"],
        summary: "Delete feedback (admin)",
        description: "Delete a feedback entry. Admin endpoint.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

