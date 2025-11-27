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

// General API rate limit
export const generalRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100, // 100 requests per minute
});

// Strict rate limit for login attempts (prevent brute force)
export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5, // 5 attempts per 15 minutes
  keyGenerator: (req) => {
    // Rate limit by IP + endpoint
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    return `login:${ip}`;
  },
});

// Rate limit for signup (prevent spam accounts)
export const signupRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 5, // 5 signups per hour per IP
  keyGenerator: (req) => {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    return `signup:${ip}`;
  },
});

// Strict rate limit for password reset (prevent abuse)
export const passwordResetRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 3, // 3 reset requests per hour
  keyGenerator: (req) => {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    return `password-reset:${ip}`;
  },
});

// Rate limit for OTP verification (prevent brute force)
export const otpVerifyRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5, // 5 OTP attempts per 15 minutes
  keyGenerator: (req) => {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    return `otp-verify:${ip}`;
  },
});

// Rate limit for OAuth (moderate limit)
export const oauthRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10, // 10 OAuth attempts per 15 minutes
  keyGenerator: (req) => {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    return `oauth:${ip}`;
  },
});

// Rate limit for people read operations (higher limit)
export const peopleReadRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 60, // 60 reads per minute per IP
  keyGenerator: (req) => {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    return `people-read:${ip}`;
  },
});

// Rate limit for people write operations (stricter limit)
export const peopleWriteRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 20, // 20 writes per minute per IP
  keyGenerator: (req) => {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    return `people-write:${ip}`;
  },
});
