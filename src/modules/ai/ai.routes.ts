import { Elysia, t } from "elysia";
import { authMiddleware } from "../auth";
import { aiService } from "./ai.service";

export const aiRoutes = new Elysia({ prefix: "/ai" })
  .use(authMiddleware)
  // Get gift suggestions
  .post(
    "/gifts",
    async ({ user, body, set }) => {
      try {
        const suggestions = await aiService.getGiftSuggestions(user.id, body.person_id, {
          occasion: body.occasion,
          priceRange: body.price_range,
        });
        return { success: true, data: suggestions };
      } catch (error) {
        if (error instanceof Error && error.message === "Person not found") {
          set.status = 404;
          return { success: false, error: "Person not found" };
        }
        throw error;
      }
    },
    {
      body: t.Object({
        person_id: t.String(),
        occasion: t.Optional(t.String()),
        price_range: t.Optional(t.String()),
      }),
      detail: {
        tags: ["ai"],
        summary: "Get gift suggestions",
        description: "Get AI-powered gift suggestions for a person",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Get relationship advice
  .post(
    "/advice",
    async ({ user, body }) => {
      const advice = await aiService.getAdvice(user.id, body.person_id || null, body.situation);
      return { success: true, data: advice };
    },
    {
      body: t.Object({
        person_id: t.Optional(t.String()),
        situation: t.String({ minLength: 10 }),
      }),
      detail: {
        tags: ["ai"],
        summary: "Get relationship advice",
        description: "Get AI-powered relationship advice",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Get memory prompts
  .post(
    "/memory-prompts",
    async ({ user, body, set }) => {
      try {
        const prompts = await aiService.getMemoryPromptsForPerson(user.id, body.person_id);
        return { success: true, data: prompts };
      } catch (error) {
        if (error instanceof Error && error.message === "Person not found") {
          set.status = 404;
          return { success: false, error: "Person not found" };
        }
        throw error;
      }
    },
    {
      body: t.Object({
        person_id: t.String(),
      }),
      detail: {
        tags: ["ai"],
        summary: "Get memory prompts",
        description: "Get AI-powered prompts to help capture memories",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Get activity suggestions
  .post(
    "/activities",
    async ({ user, body, set }) => {
      try {
        const suggestions = await aiService.getActivitySuggestions(user.id, body.person_id, {
          occasion: body.occasion,
          location: body.location,
          preferences: body.preferences,
        });
        return { success: true, data: suggestions };
      } catch (error) {
        if (error instanceof Error && error.message === "Person not found") {
          set.status = 404;
          return { success: false, error: "Person not found" };
        }
        throw error;
      }
    },
    {
      body: t.Object({
        person_id: t.String(),
        occasion: t.Optional(t.String()),
        location: t.Optional(t.String()),
        preferences: t.Optional(t.Array(t.String())),
      }),
      detail: {
        tags: ["ai"],
        summary: "Get activity suggestions",
        description: "Get AI-powered activity/date ideas",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Generate personalized message
  .post(
    "/message",
    async ({ user, body, set }) => {
      try {
        const message = await aiService.generatePersonalizedMessage(user.id, body.person_id, body.occasion, {
          tone: body.tone as "formal" | "casual" | "heartfelt" | "funny" | undefined,
          additionalContext: body.context,
        });
        return { success: true, data: message };
      } catch (error) {
        if (error instanceof Error && error.message === "Person not found") {
          set.status = 404;
          return { success: false, error: "Person not found" };
        }
        throw error;
      }
    },
    {
      body: t.Object({
        person_id: t.String(),
        occasion: t.String(),
        tone: t.Optional(t.String()),
        context: t.Optional(t.String()),
      }),
      detail: {
        tags: ["ai"],
        summary: "Generate message",
        description: "Generate a personalized message for an occasion",
        security: [{ bearerAuth: [] }],
      },
    }
  );

