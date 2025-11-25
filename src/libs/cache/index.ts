import { env } from "../../config/env";
import Redis from "ioredis";

if (!env.REDIS_URL) {
  throw new Error("REDIS_URL must be set in your environment");
}

export const redis = new Redis(env.REDIS_URL);
