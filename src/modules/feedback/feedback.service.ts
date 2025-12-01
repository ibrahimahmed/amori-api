import { db } from "../../libs/db/client";
import type {
  FeedbackInsert,
  FeedbackUpdate,
  FeedbackType,
  FeedbackStatus,
  FeedbackPriority,
  Feedback,
} from "../../libs/db/schema";
import { logger } from "../../libs/logger";
import { sendEmail, isEmailEnabled } from "../../libs/email";
import { env } from "../../config/env";
import type { Selectable } from "kysely";

/** Support email address for notifications */
const SUPPORT_EMAIL = env.SUPPORT_EMAIL || "support@amori.app";

export class ServiceError extends Error {
  constructor(
    message: string,
    public code: "NOT_FOUND" | "VALIDATION" | "DATABASE" | "INTERNAL" | "EMAIL",
    public statusCode: number = 500
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export interface FeedbackFilters {
  type?: FeedbackType;
  status?: FeedbackStatus;
  priority?: FeedbackPriority;
}

/**
 * Format feedback type for display
 */
function formatFeedbackType(type: FeedbackType): string {
  const typeLabels: Record<FeedbackType, string> = {
    bug_report: "Bug Report",
    feedback: "Customer Feedback",
    feature_request: "Feature Request",
  };
  return typeLabels[type] || type;
}

/**
 * Format priority with color indicator for email
 */
function formatPriority(priority: FeedbackPriority): string {
  const priorityLabels: Record<FeedbackPriority, string> = {
    low: "🟢 Low",
    medium: "🟡 Medium",
    high: "🟠 High",
    critical: "🔴 Critical",
  };
  return priorityLabels[priority] || priority;
}

/**
 * Generate HTML email template for support notification
 */
function generateSupportEmailHtml(feedback: Selectable<Feedback>, userName?: string): string {
  const typeLabel = formatFeedbackType(feedback.type);
  const priorityLabel = formatPriority(feedback.priority);
  const contactInfo = feedback.contact_email || "Not provided " || (userName ? `User Email: ${userName}` : "Anonymous");
  const userInfo = userName || (feedback.user_id ? `User ID: ${feedback.user_id}` : "Anonymous");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #ff6b9d 0%, #c44569 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9f9f9; padding: 20px; border: 1px solid #eee; border-top: none; }
    .field { margin-bottom: 15px; }
    .label { font-weight: 600; color: #666; font-size: 12px; text-transform: uppercase; margin-bottom: 4px; }
    .value { font-size: 14px; }
    .message-box { background: white; padding: 15px; border-radius: 6px; border: 1px solid #ddd; white-space: pre-wrap; }
    .footer { padding: 15px 20px; background: #f0f0f0; border-radius: 0 0 8px 8px; font-size: 12px; color: #666; }
    .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; }
    .badge-bug { background: #fee2e2; color: #dc2626; }
    .badge-feedback { background: #dbeafe; color: #2563eb; }
    .badge-feature { background: #d1fae5; color: #059669; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0;">New ${typeLabel}</h2>
      <p style="margin: 5px 0 0; opacity: 0.9;">Amori Support Notification</p>
    </div>
    <div class="content">
      <div class="field">
        <div class="label">Type</div>
        <div class="value">
          <span class="badge ${feedback.type === 'bug_report' ? 'badge-bug' : feedback.type === 'feature_request' ? 'badge-feature' : 'badge-feedback'}">
            ${typeLabel}
          </span>
        </div>
      </div>
      <div class="field">
        <div class="label">Priority</div>
        <div class="value">${priorityLabel}</div>
      </div>
      <div class="field">
        <div class="label">Subject</div>
        <div class="value"><strong>${feedback.subject}</strong></div>
      </div>
      <div class="field">
        <div class="label">Message</div>
        <div class="message-box">${feedback.message}</div>
      </div>
      <div class="field">
        <div class="label">From</div>
        <div class="value">${userInfo}</div>
      </div>
      <div class="field">
        <div class="label">Contact Email</div>
        <div class="value">${contactInfo}</div>
      </div>
      ${feedback.device_info ? `
      <div class="field">
        <div class="label">Device Info</div>
        <div class="value">${feedback.device_info}</div>
      </div>
      ` : ''}
      ${feedback.app_version ? `
      <div class="field">
        <div class="label">App Version</div>
        <div class="value">${feedback.app_version}</div>
      </div>
      ` : ''}
      ${feedback.screenshot_url ? `
      <div class="field">
        <div class="label">Screenshot</div>
        <div class="value"><a href="${feedback.screenshot_url}" style="color: #c44569;">View Screenshot</a></div>
      </div>
      ` : ''}
    </div>
    <div class="footer">
      <p style="margin: 0;">Feedback ID: ${feedback.id}</p>
      <p style="margin: 5px 0 0;">Submitted: ${new Date(feedback.created_at).toLocaleString()}</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generate plain text email for support notification
 */
function generateSupportEmailText(feedback: Selectable<Feedback>, userName?: string): string {
  const typeLabel = formatFeedbackType(feedback.type);
  const contactInfo = feedback.contact_email || "Not provided";
  const userInfo = userName || (feedback.user_id ? `User ID: ${feedback.user_id}` : "Anonymous");

  return `
New ${typeLabel} - Amori Support

Type: ${typeLabel}
Priority: ${feedback.priority.toUpperCase()}
Subject: ${feedback.subject}

Message:
${feedback.message}

---
From: ${userInfo}
Contact Email: ${contactInfo}
${feedback.device_info ? `Device Info: ${feedback.device_info}` : ''}
${feedback.app_version ? `App Version: ${feedback.app_version}` : ''}
${feedback.screenshot_url ? `Screenshot: ${feedback.screenshot_url}` : ''}

---
Feedback ID: ${feedback.id}
Submitted: ${new Date(feedback.created_at).toLocaleString()}
  `.trim();
}

export class FeedbackService {
  /**
   * Get all feedback entries (admin use)
   */
  async getAll(filters?: FeedbackFilters): Promise<Selectable<Feedback>[]> {
    try {
      let query = db.selectFrom("feedback").selectAll();

      if (filters?.type) {
        query = query.where("type", "=", filters.type);
      }

      if (filters?.status) {
        query = query.where("status", "=", filters.status);
      }

      if (filters?.priority) {
        query = query.where("priority", "=", filters.priority);
      }

      return await query.orderBy("created_at", "desc").execute();
    } catch (error) {
      logger.error("Failed to get feedback entries", error as Error, { filters });
      throw new ServiceError("Failed to retrieve feedback", "DATABASE", 500);
    }
  }

  /**
   * Get feedback entries for a specific user
   */
  async getByUserId(userId: string): Promise<Selectable<Feedback>[]> {
    try {
      return await db
        .selectFrom("feedback")
        .selectAll()
        .where("user_id", "=", userId)
        .orderBy("created_at", "desc")
        .execute();
    } catch (error) {
      logger.error("Failed to get user feedback", error as Error, { userId });
      throw new ServiceError("Failed to retrieve feedback", "DATABASE", 500);
    }
  }

  /**
   * Get a single feedback entry by ID
   */
  async getById(feedbackId: string): Promise<Selectable<Feedback> | undefined> {
    try {
      return await db
        .selectFrom("feedback")
        .selectAll()
        .where("id", "=", feedbackId)
        .executeTakeFirst();
    } catch (error) {
      logger.error("Failed to get feedback by ID", error as Error, { feedbackId });
      throw new ServiceError("Failed to retrieve feedback", "DATABASE", 500);
    }
  }

  /**
   * Create a new feedback entry and send notification email
   */
  async create(data: FeedbackInsert, userName?: string): Promise<Selectable<Feedback> | undefined> {
    try {
      // Set default priority based on type
      const priority = data.priority || (data.type === "bug_report" ? "high" : "medium");

      const feedback = await db
        .insertInto("feedback")
        .values({
          ...data,
          priority,
          status: "open",
        } as any)
        .returningAll()
        .executeTakeFirst();

      if (feedback) {
        // Send notification email to support
        await this.sendSupportNotification(feedback, userName);
        logger.info("Feedback created successfully", { feedbackId: feedback.id, type: feedback.type });
      }

      return feedback;
    } catch (error) {
      logger.error("Failed to create feedback", error as Error, { userId: data.user_id ?? undefined, type: data.type });
      throw new ServiceError("Failed to submit feedback", "DATABASE", 500);
    }
  }

  /**
   * Update a feedback entry (admin use)
   */
  async update(feedbackId: string, data: FeedbackUpdate): Promise<Selectable<Feedback> | undefined> {
    try {
      // If status is being set to resolved, set resolved_at
      const updateData: FeedbackUpdate = { ...data };
      if (data.status === "resolved" && !data.resolved_at) {
        updateData.resolved_at = new Date();
      }

      return await db
        .updateTable("feedback")
        .set(updateData)
        .where("id", "=", feedbackId)
        .returningAll()
        .executeTakeFirst();
    } catch (error) {
      logger.error("Failed to update feedback", error as Error, { feedbackId });
      throw new ServiceError("Failed to update feedback", "DATABASE", 500);
    }
  }

  /**
   * Delete a feedback entry
   */
  async delete(feedbackId: string): Promise<boolean> {
    try {
      const result = await db
        .deleteFrom("feedback")
        .where("id", "=", feedbackId)
        .executeTakeFirst();

      return result.numDeletedRows > 0;
    } catch (error) {
      logger.error("Failed to delete feedback", error as Error, { feedbackId });
      throw new ServiceError("Failed to delete feedback", "DATABASE", 500);
    }
  }

  /**
   * Send email notification to support team
   */
  private async sendSupportNotification(feedback: Selectable<Feedback>, userName?: string): Promise<void> {
    if (!isEmailEnabled()) {
      logger.warn("Email not enabled, skipping support notification", { feedbackId: feedback.id });
      return;
    }

    try {
      const typeLabel = formatFeedbackType(feedback.type);
      const priorityPrefix = feedback.priority === "critical" ? "🔴 CRITICAL: " : "";

      await sendEmail({
        to: SUPPORT_EMAIL,
        subject: `${priorityPrefix}[${typeLabel}] ${feedback.subject}`,
        html: generateSupportEmailHtml(feedback, userName),
        text: generateSupportEmailText(feedback, userName),
      });

      logger.info("Support notification sent", { feedbackId: feedback.id, type: feedback.type });
    } catch (error) {
      // Log but don't fail the request if email fails
      logger.error("Failed to send support notification email", error as Error, { feedbackId: feedback.id });
    }
  }

  /**
   * Get feedback statistics (admin use)
   */
  async getStatistics(): Promise<{
    total: number;
    byType: Record<FeedbackType, number>;
    byStatus: Record<FeedbackStatus, number>;
    byPriority: Record<FeedbackPriority, number>;
  }> {
    try {
      const feedbacks = await db.selectFrom("feedback").selectAll().execute();

      const byType: Record<FeedbackType, number> = { bug_report: 0, feedback: 0, feature_request: 0 };
      const byStatus: Record<FeedbackStatus, number> = { open: 0, in_progress: 0, resolved: 0, closed: 0 };
      const byPriority: Record<FeedbackPriority, number> = { low: 0, medium: 0, high: 0, critical: 0 };

      for (const fb of feedbacks) {
        byType[fb.type]++;
        byStatus[fb.status]++;
        byPriority[fb.priority]++;
      }

      return {
        total: feedbacks.length,
        byType,
        byStatus,
        byPriority,
      };
    } catch (error) {
      logger.error("Failed to get feedback statistics", error as Error);
      throw new ServiceError("Failed to retrieve statistics", "DATABASE", 500);
    }
  }
}

export const feedbackService = new FeedbackService();

