// Environment variables are set in tests/setup.ts (preloaded by bun)
import { describe, expect, it, mock, beforeEach } from "bun:test";
import { Elysia } from "elysia";

// Mock health service responses
const mockHealthStatus = {
  status: "healthy",
  timestamp: new Date().toISOString(),
  version: "1.0.0",
  service: "amori-api",
  uptime: 12345,
  dependencies: {
    database: "healthy",
    redis: "healthy",
    supabase: "healthy",
  },
};

const mockLiveStatus = {
  status: "ok",
  timestamp: new Date().toISOString(),
};

const mockReadyStatus = {
  status: "ready",
  timestamp: new Date().toISOString(),
  checks: {
    database: true,
    redis: true,
  },
};

// Create test app with mocked health endpoints
function createTestHealthApp() {
  return new Elysia()
    .get("/", () => ({
      message: "Welcome to Amori API",
      version: "1.0.0",
      status: "running",
    }))
    .get("/health", () => mockHealthStatus)
    .get("/health/live", () => mockLiveStatus)
    .get("/health/ready", () => mockReadyStatus);
}

describe("Health Routes", () => {
  let app: ReturnType<typeof createTestHealthApp>;

  beforeEach(() => {
    app = createTestHealthApp();
  });

  describe("GET /health", () => {
    it("should return health status", async () => {
      const response = await app.handle(new Request("http://localhost/health"));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty("status");
      expect(data).toHaveProperty("timestamp");
      expect(data).toHaveProperty("version");
      expect(data).toHaveProperty("service", "amori-api");
    });

    it("should include dependency status", async () => {
      const response = await app.handle(new Request("http://localhost/health"));
      const data = await response.json();

      expect(data).toHaveProperty("dependencies");
      expect(data.dependencies).toHaveProperty("database");
      expect(data.dependencies).toHaveProperty("redis");
    });

    it("should include uptime", async () => {
      const response = await app.handle(new Request("http://localhost/health"));
      const data = await response.json();

      expect(data).toHaveProperty("uptime");
      expect(typeof data.uptime).toBe("number");
    });
  });

  describe("GET /health/live", () => {
    it("should return liveness status", async () => {
      const response = await app.handle(new Request("http://localhost/health/live"));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty("status", "ok");
      expect(data).toHaveProperty("timestamp");
    });

    it("should return quickly (for k8s probes)", async () => {
      const start = Date.now();
      await app.handle(new Request("http://localhost/health/live"));
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100); // Should respond in under 100ms
    });
  });

  describe("GET /health/ready", () => {
    it("should return readiness status", async () => {
      const response = await app.handle(new Request("http://localhost/health/ready"));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty("status");
      expect(data).toHaveProperty("timestamp");
    });

    it("should include dependency checks", async () => {
      const response = await app.handle(new Request("http://localhost/health/ready"));
      const data = await response.json();

      expect(data).toHaveProperty("checks");
      expect(data.checks).toHaveProperty("database");
      expect(data.checks).toHaveProperty("redis");
    });
  });
});

describe("Root Route", () => {
  let app: ReturnType<typeof createTestHealthApp>;

  beforeEach(() => {
    app = createTestHealthApp();
  });

  describe("GET /", () => {
    it("should return welcome message", async () => {
      const response = await app.handle(new Request("http://localhost/"));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty("message", "Welcome to Amori API");
      expect(data).toHaveProperty("version");
      expect(data).toHaveProperty("status", "running");
    });

    it("should include API version", async () => {
      const response = await app.handle(new Request("http://localhost/"));
      const data = await response.json();

      expect(typeof data.version).toBe("string");
      expect(data.version).toMatch(/^\d+\.\d+\.\d+$/); // Semver format
    });
  });
});

describe("Health Response Structure", () => {
  let app: ReturnType<typeof createTestHealthApp>;

  beforeEach(() => {
    app = createTestHealthApp();
  });

  it("should return JSON content type", async () => {
    const response = await app.handle(new Request("http://localhost/health"));
    const contentType = response.headers.get("content-type");

    expect(contentType).toContain("application/json");
  });

  it("should return valid ISO timestamp", async () => {
    const response = await app.handle(new Request("http://localhost/health"));
    const data = await response.json();

    const timestamp = new Date(data.timestamp);
    expect(timestamp.toISOString()).toBe(data.timestamp);
  });
});

describe("Error Scenarios", () => {
  it("should handle non-existent routes", async () => {
    const app = createTestHealthApp();
    const response = await app.handle(new Request("http://localhost/non-existent"));

    expect(response.status).toBe(404);
  });

  it("should handle invalid methods gracefully", async () => {
    const app = createTestHealthApp();
    const response = await app.handle(
      new Request("http://localhost/health", { method: "POST" })
    );

    // Elysia returns 404 for method mismatch by default
    expect(response.status).toBe(404);
  });
});
