import { env } from "../../config/env";
import twilio from "twilio";

export interface SMSOptions {
  to: string;
  message: string;
}

const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);

export async function sendSMS(options: SMSOptions): Promise<boolean> {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_PHONE_NUMBER) {
    throw new Error("Twilio env vars are not set");
  }
  await client.messages.create({
    body: options.message,
    to: options.to,
    from: env.TWILIO_PHONE_NUMBER,
  });
  return true;
}
