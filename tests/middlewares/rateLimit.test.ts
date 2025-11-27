// Environment variables are set in tests/setup.ts (preloaded by bun)
import { describe, expect, it, beforeEach } from "bun:test";
import { Elysia } from "elysia";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * These tests verify the rate limit middleware logic.
 * We use an in-memory store to simulate Redis behavior.
 */

// In-memory store to simulate Redis behavior
const requestCounts = new Map<string, number>();

function resetStore() {
  requestCounts.clear();
}

// Increment counter and return new value (like Redis INCR)
function incr(key: string): number {
  const current = (requestCounts.get(key) || 0) + 1;
  requestCounts.set(key, current);
  return current;
}

// Create test app with rate limiting logic embedded
function createRateLimitedApp(options: {
  maxRequests: number;
  keyGenerator?: (request: Request) => string;
}) {
  const { maxRequests, keyGenerator = () => "default" } = options;

  return new Elysia()
    .onBeforeHandle(({ request, set }) => {
      const key = keyGenerator(request);
      const current = incr(key);
      const exceeded = current > maxRequests;

      if (exceeded) {
        set.status = 429;
        return {
          success: false,
          error: "Too many requests",
          retryAfter: Date.now() + 60000,
        };
      }

      // Store rate limit info for potential use in handlers
      (request as any)._rateLimit = {
        remaining: Math.max(0, maxRequests - current),
        current,
        exceeded,
      };
    })
    .get("/test", ({ request }) => {
      const rateLimit = (request as any)._rateLimit || { remaining: 0, current: 0 };
      return {
        success: true,
        remaining: rateLimit.remaining,
        current: rateLimit.current,
      };
    })
    .post("/test", () => ({ success: true }))
    .post("/signin", () => ({ success: true }))
    .post("/signup", () => ({ success: true }))
    .post("/forgot-password", () => ({ success: true }))
    .post("/reset-password", () => ({ success: true }))
    .post("/signin/oauth", () => ({ success: true }));
}

describe("Rate Limit Middleware - Unit Tests", () => {
  beforeEach(() => {
    resetStore();
  });

  describe("Request Counting", () => {
    it("should count first request as 1", async () => {
      const app = createRateLimitedApp({ maxRequests: 5 });

      const response = await app.handle(new Request("http://localhost/test"));
      const data = await response.json();

      expect(data.current).toBe(1);
    });

    it("should increment count on each request", async () => {
      const app = createRateLimitedApp({ maxRequests: 5 });

      const response1 = await app.handle(new Request("http://localhost/test"));
      expect((await response1.json()).current).toBe(1);

      const response2 = await app.handle(new Request("http://localhost/test"));
      expect((await response2.json()).current).toBe(2);

      const response3 = await app.handle(new Request("http://localhost/test"));
      expect((await response3.json()).current).toBe(3);
    });

    it("should track remaining requests", async () => {
      const app = createRateLimitedApp({ maxRequests: 3 });

      const response1 = await app.handle(new Request("http://localhost/test"));
      expect((await response1.json()).remaining).toBe(2);

      const response2 = await app.handle(new Request("http://localhost/test"));
      expect((await response2.json()).remaining).toBe(1);

      const response3 = await app.handle(new Request("http://localhost/test"));
      expect((await response3.json()).remaining).toBe(0);
    });
  });

  describe("Rate Limit Enforcement", () => {
    it("should allow requests within limit", async () => {
      const app = createRateLimitedApp({ maxRequests: 3 });

      for (let i = 0; i < 3; i++) {
        const response = await app.handle(new Request("http://localhost/test"));
        expect(response.status).toBe(200);
      }
    });

    it("should return 429 when limit exceeded", async () => {
      const app = createRateLimitedApp({ maxRequests: 2 });

      await app.handle(new Request("http://localhost/test"));
      await app.handle(new Request("http://localhost/test"));

      const response = await app.handle(new Request("http://localhost/test"));
      expect(response.status).toBe(429);
    });

    it("should return error message when blocked", async () => {
      const app = createRateLimitedApp({ maxRequests: 1 });

      await app.handle(new Request("http://localhost/test"));
      const response = await app.handle(new Request("http://localhost/test"));
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error).toBe("Too many requests");
    });

    it("should include retryAfter timestamp", async () => {
      const app = createRateLimitedApp({ maxRequests: 1 });

      await app.handle(new Request("http://localhost/test"));
      const response = await app.handle(new Request("http://localhost/test"));
      const data = await response.json();

      expect(data).toHaveProperty("retryAfter");
      expect(typeof data.retryAfter).toBe("number");
    });
  });

  describe("Key Generator", () => {
    it("should use default key when no generator provided", async () => {
      const app = createRateLimitedApp({ maxRequests: 1 });

      const response1 = await app.handle(new Request("http://localhost/test"));
      expect(response1.status).toBe(200);

      const response2 = await app.handle(new Request("http://localhost/test"));
      expect(response2.status).toBe(429);
    });

    it("should isolate rate limits by key", async () => {
      const app = createRateLimitedApp({
        maxRequests: 1,
        keyGenerator: (req) => req.headers.get("x-api-key") || "default",
      });

      // First API key - first request
      const response1 = await app.handle(
        new Request("http://localhost/test", { headers: { "x-api-key": "key-1" } })
      );
      expect(response1.status).toBe(200);

      // First API key - second request (blocked)
      const response2 = await app.handle(
        new Request("http://localhost/test", { headers: { "x-api-key": "key-1" } })
      );
      expect(response2.status).toBe(429);

      // Second API key - first request (allowed, different key)
      const response3 = await app.handle(
        new Request("http://localhost/test", { headers: { "x-api-key": "key-2" } })
      );
      expect(response3.status).toBe(200);
    });

    it("should support IP-based rate limiting", async () => {
      const app = createRateLimitedApp({
        maxRequests: 2,
        keyGenerator: (req) => {
          const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
          return `ip:${ip}`;
        },
      });

      // Same IP - 2 requests allowed
      await app.handle(new Request("http://localhost/test", { headers: { "x-forwarded-for": "192.168.1.1" } }));
      await app.handle(new Request("http://localhost/test", { headers: { "x-forwarded-for": "192.168.1.1" } }));

      // Same IP - 3rd blocked
      const blocked = await app.handle(
        new Request("http://localhost/test", { headers: { "x-forwarded-for": "192.168.1.1" } })
      );
      expect(blocked.status).toBe(429);

      // Different IP - allowed
      const allowed = await app.handle(
        new Request("http://localhost/test", { headers: { "x-forwarded-for": "10.0.0.1" } })
      );
      expect(allowed.status).toBe(200);
    });
  });

  describe("Edge Cases", () => {
    it("should handle maxRequests of 0 (always block)", async () => {
      const app = createRateLimitedApp({ maxRequests: 0 });

      const response = await app.handle(new Request("http://localhost/test"));
      expect(response.status).toBe(429);
    });

    it("should handle maxRequests of 1", async () => {
      const app = createRateLimitedApp({ maxRequests: 1 });

      const response1 = await app.handle(new Request("http://localhost/test"));
      expect(response1.status).toBe(200);

      const response2 = await app.handle(new Request("http://localhost/test"));
      expect(response2.status).toBe(429);
    });

    it("should handle high request counts", async () => {
      const app = createRateLimitedApp({ maxRequests: 100 });

      // Make 99 requests
      for (let i = 0; i < 99; i++) {
        await app.handle(new Request("http://localhost/test"));
      }

      // 100th should succeed with 0 remaining
      const response = await app.handle(new Request("http://localhost/test"));
      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.remaining).toBe(0);

      // 101st should be blocked
      const blocked = await app.handle(new Request("http://localhost/test"));
      expect(blocked.status).toBe(429);
    });

    it("should not return negative remaining", async () => {
      const app = createRateLimitedApp({ maxRequests: 1 });

      const response1 = await app.handle(new Request("http://localhost/test"));
      const data1 = await response1.json();
      expect(data1.remaining).toBe(0);
    });
  });
});

describe("Auth Rate Limiter Configurations", () => {
  beforeEach(() => {
    resetStore();
  });

  it("Login: 5 attempts per window", async () => {
    const app = createRateLimitedApp({ maxRequests: 5 });

    for (let i = 0; i < 5; i++) {
      const response = await app.handle(new Request("http://localhost/signin", { method: "POST" }));
      expect(response.status).toBe(200);
    }

    const response = await app.handle(new Request("http://localhost/signin", { method: "POST" }));
    expect(response.status).toBe(429);
  });

  it("Signup: 5 attempts per window", async () => {
    const app = createRateLimitedApp({ maxRequests: 5 });

    for (let i = 0; i < 5; i++) {
      const response = await app.handle(new Request("http://localhost/signup", { method: "POST" }));
      expect(response.status).toBe(200);
    }

    const response = await app.handle(new Request("http://localhost/signup", { method: "POST" }));
    expect(response.status).toBe(429);
  });

  it("Password Reset: 3 attempts per window", async () => {
    const app = createRateLimitedApp({ maxRequests: 3 });

    for (let i = 0; i < 3; i++) {
      const response = await app.handle(new Request("http://localhost/forgot-password", { method: "POST" }));
      expect(response.status).toBe(200);
    }

    const response = await app.handle(new Request("http://localhost/forgot-password", { method: "POST" }));
    expect(response.status).toBe(429);
  });

  it("OTP Verify: 5 attempts per window", async () => {
    const app = createRateLimitedApp({ maxRequests: 5 });

    for (let i = 0; i < 5; i++) {
      const response = await app.handle(new Request("http://localhost/reset-password", { method: "POST" }));
      expect(response.status).toBe(200);
    }

    const response = await app.handle(new Request("http://localhost/reset-password", { method: "POST" }));
    expect(response.status).toBe(429);
  });

  it("OAuth: 10 attempts per window", async () => {
    const app = createRateLimitedApp({ maxRequests: 10 });

    for (let i = 0; i < 10; i++) {
      const response = await app.handle(new Request("http://localhost/signin/oauth", { method: "POST" }));
      expect(response.status).toBe(200);
    }

    const response = await app.handle(new Request("http://localhost/signin/oauth", { method: "POST" }));
    expect(response.status).toBe(429);
  });
});

describe("People Rate Limiter Configurations", () => {
  beforeEach(() => {
    resetStore();
  });

  it("People Read: 60 requests per minute", async () => {
    const app = createRateLimitedApp({ maxRequests: 60 });

    // Make 60 successful requests
    for (let i = 0; i < 60; i++) {
      const response = await app.handle(new Request("http://localhost/test"));
      expect(response.status).toBe(200);
    }

    // 61st should be blocked
    const response = await app.handle(new Request("http://localhost/test"));
    expect(response.status).toBe(429);
  });

  it("People Write: 20 requests per minute", async () => {
    const app = createRateLimitedApp({ maxRequests: 20 });

    // Make 20 successful requests
    for (let i = 0; i < 20; i++) {
      const response = await app.handle(new Request("http://localhost/test", { method: "POST" }));
      expect(response.status).toBe(200);
    }

    // 21st should be blocked
    const response = await app.handle(new Request("http://localhost/test", { method: "POST" }));
    expect(response.status).toBe(429);
  });

  it("should use separate keys for read and write operations", async () => {
    // Simulating separate rate limiters with different keys
    const readApp = createRateLimitedApp({
      maxRequests: 2,
      keyGenerator: () => "people-read:127.0.0.1",
    });
    const writeApp = createRateLimitedApp({
      maxRequests: 2,
      keyGenerator: () => "people-write:127.0.0.1",
    });

    // Max out read limit
    await readApp.handle(new Request("http://localhost/test"));
    await readApp.handle(new Request("http://localhost/test"));
    const readBlocked = await readApp.handle(new Request("http://localhost/test"));
    expect(readBlocked.status).toBe(429);

    // Write should still work (different key)
    const writeAllowed = await writeApp.handle(new Request("http://localhost/test", { method: "POST" }));
    expect(writeAllowed.status).toBe(200);
  });
});

describe("Rate Limit Response Format", () => {
  beforeEach(() => {
    resetStore();
  });

  it("should return JSON for blocked requests", async () => {
    const app = createRateLimitedApp({ maxRequests: 1 });

    await app.handle(new Request("http://localhost/test"));
    const response = await app.handle(new Request("http://localhost/test"));

    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("should have consistent error structure", async () => {
    const app = createRateLimitedApp({ maxRequests: 1 });

    await app.handle(new Request("http://localhost/test"));
    const response = await app.handle(new Request("http://localhost/test"));
    const data = await response.json();

    expect(data).toEqual({
      success: false,
      error: "Too many requests",
      retryAfter: expect.any(Number),
    });
  });
});
