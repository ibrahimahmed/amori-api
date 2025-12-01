import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { env } from "./config/env";
import { corsMiddleware } from "./middlewares/cors";
import { errorHandler } from "./middlewares/errorHandler";
import { metricsMiddleware } from "./middlewares/metrics";

// Import routes
import { healthRoutes } from "./modules/health";
import { authRoutes } from "./modules/auth";
import { peopleRoutes } from "./modules/people";
import { memoriesRoutes } from "./modules/memories";
import { wishlistRoutes } from "./modules/wishlist";
import { plannerRoutes } from "./modules/planner";
import { aiRoutes } from "./modules/ai";
import { feedbackRoutes } from "./modules/feedback";

const app = new Elysia()
  .use(corsMiddleware)
  .use(metricsMiddleware)
  .use(errorHandler)
  .use(
    swagger({
      documentation: {
        info: {
          title: "Amori API",
          version: "1.0.0",
          description: "Amori - Relationship & Memory Management API",
          contact: {
            name: "Amori Team",
          },
        },
        tags: [
          { name: "health", description: "Health check endpoints" },
          { name: "auth", description: "Authentication and user profile" },
          { name: "people", description: "Relationship management" },
          { name: "memories", description: "Memory management" },
          { name: "wishlist", description: "Wishlist/gift ideas management" },
          { name: "planner", description: "Event and reminder planning" },
          { name: "ai", description: "AI-powered suggestions and advice" },
          { name: "feedback", description: "Bug reports, feedback, and feature requests" },
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: "http",
              scheme: "bearer",
              bearerFormat: "JWT",
              description: "Supabase JWT token",
            },
          },
        },
      },
    })
  )
  // Register all routes
  .use(healthRoutes)
  .use(authRoutes)
  .use(peopleRoutes)
  .use(memoriesRoutes)
  .use(wishlistRoutes)
  .use(plannerRoutes)
  .use(aiRoutes)
  .use(feedbackRoutes)
  // Root endpoint
  .get("/", () => ({
    message: "Welcome to Amori API",
    version: "1.0.0",
    status: "running",
    timestamp: new Date().toISOString(),
    docs: "/swagger",
  }))
  .listen(env.PORT || 3000, () => {
    console.log(`🩷 Amori API running at http://localhost:${env.PORT || 3000}`);
    console.log(`📚 Swagger docs at http://localhost:${env.PORT || 3000}/swagger`);
    console.log(`💚 Health check at http://localhost:${env.PORT || 3000}/health`);
  });

export type App = typeof app;
