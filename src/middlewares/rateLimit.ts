import { Elysia } from "elysia";
import { redis } from "../libs/cache";

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (request: Request) => string;
}

export const rateLimit = (options: RateLimitOptions) => {
  const { windowMs, maxRequests, keyGenerator = req => new URL(req.url).hostname } = options;

  return new Elysia()
    .derive(async ({ request }) => {
      const key = `rate_limit:${keyGenerator(request)}`;
      const current = await redis.incr(key);
      if (current === 1) {
        await redis.expire(key, Math.ceil(windowMs / 1000));
      }
      return {
        rateLimit: {
          remaining: Math.max(0, maxRequests - current),
          reset: Date.now() + windowMs,
          exceeded: current > maxRequests,
        },
      };
    })
    .onBeforeHandle(({ rateLimit, set }) => {
      if (rateLimit.exceeded) {
        set.status = 429;
        return {
          error: "Too many requests",
          retryAfter: rateLimit.reset,
        };
      }
    });
};

// Usage examples
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5, // 5 attempts per window
  keyGenerator: req => {
    const url = new URL(req.url);
    return `auth:${url.hostname}:${url.pathname}`;
  },
});

export const generalRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100, // 100 requests per minute
});
