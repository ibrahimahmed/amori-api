import { env } from "../../config/env";
import { Resend } from "resend";

export interface EmailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

const resend = new Resend(env.RESEND_API_KEY);

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set in env");
  const payload: any = {
    to: options.to,
    subject: options.subject,
    text: options.text ?? "",
  };
  if (options.html) payload.html = options.html;
  await resend.emails.send(payload);
  return true;
}
