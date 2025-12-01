import { Generated, ColumnType } from "kysely";

export type FeedbackType = "bug_report" | "feedback" | "feature_request";
export type FeedbackStatus = "open" | "in_progress" | "resolved" | "closed";
export type FeedbackPriority = "low" | "medium" | "high" | "critical";

export interface Feedback {
  id: Generated<string>; // UUID
  user_id: string | null; // FK to users (null for anonymous feedback)
  type: FeedbackType;
  subject: string;
  message: string;
  contact_email: string | null; // For follow-up (useful for anonymous users)
  priority: FeedbackPriority;
  status: FeedbackStatus;
  screenshot_url: string | null; // Optional attachment
  device_info: string | null; // Browser/device info for bug reports
  app_version: string | null; // App version for bug reports
  admin_notes: string | null; // Internal notes for support team
  resolved_at: Date | null;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string | undefined>;
}

export interface FeedbackInsert {
  id?: string;
  user_id?: string | null;
  type: FeedbackType;
  subject: string;
  message: string;
  contact_email?: string | null;
  priority?: FeedbackPriority;
  status?: FeedbackStatus;
  screenshot_url?: string | null;
  device_info?: string | null;
  app_version?: string | null;
}

export interface FeedbackUpdate {
  type?: FeedbackType;
  subject?: string;
  message?: string;
  priority?: FeedbackPriority;
  status?: FeedbackStatus;
  admin_notes?: string | null;
  resolved_at?: Date | null;
}

