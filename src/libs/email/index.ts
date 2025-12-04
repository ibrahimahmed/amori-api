import { env } from "../../config/env";
import { Resend } from "resend";
import { logger } from "../logger";

export interface EmailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  from?: string;
}

// Initialize Resend client only if API key is available
const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

/**
 * Send an email using Resend
 * @throws Error if RESEND_API_KEY is not configured
 */
export async function sendEmail(options: EmailOptions): Promise<boolean> {
  if (!resend || !env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured. Email sending is disabled.");
  }

  const { data, error } = await resend.emails.send({
    from: "Amori <noreply@amori.info>",
    to: options.to,
    subject: options.subject,
    text: options.text || "",
    html: options.html,
  });

  if (error) {
    logger.error("Failed to send email", error, { email: options.to });
    throw new Error(`Failed to send email: ${error.message}`);
  }

  return true;
}

/**
 * Check if email sending is available
 */
export function isEmailEnabled(): boolean {
  return !!env.RESEND_API_KEY;
}
