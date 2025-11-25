import { Elysia } from "elysia";
import { healthService } from "./health.service";

export const healthRoutes = new Elysia({ prefix: "/health" })
  .get(
    "/",
    async () => {
      return await healthService.getHealthStatus();
    },
    {
      detail: {
        tags: ["health"],
        summary: "Health check",
        description: "Returns the health status of the service including database, Redis, and Supabase connectivity",
      },
    }
  )
  .get(
    "/live",
    async () => {
      return await healthService.getLivenessStatus();
    },
    {
      detail: {
        tags: ["health"],
        summary: "Liveness probe",
        description: "Simple liveness check for container orchestration",
      },
    }
  )
  .get(
    "/ready",
    async () => {
      return await healthService.getReadinessStatus();
    },
    {
      detail: {
        tags: ["health"],
        summary: "Readiness probe",
        description: "Readiness check - ensures all dependencies are available",
      },
    }
  );
