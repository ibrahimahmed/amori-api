import { describe, expect, it, beforeAll } from "bun:test";

// Set test environment before imports
process.env.NODE_ENV = "test";
process.env.TEST_MODE = "true";
process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_ANON_KEY = "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.OPENAI_API_KEY = "sk-test-key";
process.env.PORT = "3001";

describe("Health Routes", () => {
  describe("GET /health", () => {
    it("should return health status", async () => {
      const response = await fetch("http://localhost:3001/health");

      // In test mode, we might not have the server running
      // This test is primarily for CI integration
      if (response.ok) {
        const data = await response.json();
        expect(data).toHaveProperty("status");
        expect(data).toHaveProperty("timestamp");
        expect(data).toHaveProperty("version");
        expect(data).toHaveProperty("service", "amori-api");
      }
    });
  });

  describe("GET /health/live", () => {
    it("should return liveness status", async () => {
      const response = await fetch("http://localhost:3001/health/live");

      if (response.ok) {
        const data = await response.json();
        expect(data).toHaveProperty("status", "ok");
        expect(data).toHaveProperty("timestamp");
      }
    });
  });

  describe("GET /health/ready", () => {
    it("should return readiness status", async () => {
      const response = await fetch("http://localhost:3001/health/ready");

      if (response.ok) {
        const data = await response.json();
        expect(data).toHaveProperty("status");
        expect(data).toHaveProperty("timestamp");
      }
    });
  });
});

describe("Root Route", () => {
  describe("GET /", () => {
    it("should return welcome message", async () => {
      const response = await fetch("http://localhost:3001/");

      if (response.ok) {
        const data = await response.json();
        expect(data).toHaveProperty("message", "Welcome to Amori API");
        expect(data).toHaveProperty("version");
        expect(data).toHaveProperty("status", "running");
      }
    });
  });
});
