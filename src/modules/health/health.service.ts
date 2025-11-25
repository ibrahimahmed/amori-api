import { redis } from "../../libs/cache";
import { checkDatabaseHealth } from "../../libs/db/client";
import { checkSupabaseHealth } from "../../libs/supabase";

const VERSION = "1.0.0";

export class HealthService {
  async getHealthStatus() {
    if (process.env.NODE_ENV === "test" || process.env.TEST_MODE === "true") {
      return {
        status: "healthy",
        timestamp: new Date().toISOString(),
        version: VERSION,
        service: "amori-api",
        checks: {
          database: "mocked",
          redis: "mocked",
          supabase: "mocked",
        },
        uptime: 0,
        memory: {},
      };
    }

    // Real health checks
    let dbStatus = "unknown";
    let dbLatency: number | undefined;
    let redisStatus = "unknown";
    let supabaseStatus = "unknown";

    try {
      const dbHealth = await checkDatabaseHealth();
      dbStatus = dbHealth.healthy ? "connected" : "error";
      dbLatency = dbHealth.latency;
    } catch {
      dbStatus = "error";
    }

    try {
      const start = Date.now();
      await redis.ping();
      redisStatus = "connected";
    } catch {
      redisStatus = "error";
    }

    try {
      const supabaseHealth = await checkSupabaseHealth();
      supabaseStatus = supabaseHealth.healthy ? "connected" : "error";
    } catch {
      supabaseStatus = "error";
    }

    const allHealthy = dbStatus === "connected" && redisStatus === "connected" && supabaseStatus === "connected";

    return {
      status: allHealthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      version: VERSION,
      service: "amori-api",
      checks: {
        database: dbStatus,
        databaseLatency: dbLatency,
        redis: redisStatus,
        supabase: supabaseStatus,
      },
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };
  }

  async getLivenessStatus() {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  }

  async getReadinessStatus() {
    if (process.env.NODE_ENV === "test" || process.env.TEST_MODE === "true") {
      return { status: "ready", timestamp: new Date().toISOString() };
    }

    // Real readiness checks
    let ready = true;

    try {
      const dbHealth = await checkDatabaseHealth();
      if (!dbHealth.healthy) ready = false;
    } catch {
      ready = false;
    }

    try {
      await redis.ping();
    } catch {
      ready = false;
    }

    return {
      status: ready ? "ready" : "not-ready",
      timestamp: new Date().toISOString(),
    };
  }
}

export const healthService = new HealthService();
