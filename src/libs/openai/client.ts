import OpenAI from "openai";
import { env } from "../../config/env";
import { redis } from "../cache";

// Initialize OpenAI client
export const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

// Cache TTL in seconds (1 hour default)
const DEFAULT_CACHE_TTL = 3600;

/**
 * Generate a cache key for AI responses
 */
function generateCacheKey(prefix: string, input: string): string {
  // Simple hash for cache key
  const hash = input
    .split("")
    .reduce((acc, char) => {
      return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
    }, 0)
    .toString(16);
  return `ai:${prefix}:${hash}`;
}

/**
 * Get cached AI response or generate new one
 */
async function getCachedOrGenerate<T>(
  cacheKey: string,
  generator: () => Promise<T>,
  ttl: number = DEFAULT_CACHE_TTL
): Promise<T> {
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as T;
    }
  } catch {
    // Cache miss or error, continue to generate
  }

  const result = await generator();

  try {
    await redis.set(cacheKey, JSON.stringify(result), "EX", ttl);
  } catch {
    // Cache write error, ignore
  }

  return result;
}

/**
 * Generate gift suggestions for a person
 */
export async function suggestGifts(context: {
  personName: string;
  relationType: string;
  occasion?: string;
  interests?: string[];
  priceRange?: string;
}): Promise<string[]> {
  const cacheKey = generateCacheKey("gifts", JSON.stringify(context));

  return getCachedOrGenerate(cacheKey, async () => {
    const prompt = `Suggest 5 thoughtful and creative gift ideas for ${context.personName} (${context.relationType}).
${context.occasion ? `Occasion: ${context.occasion}` : ""}
${context.interests?.length ? `Interests: ${context.interests.join(", ")}` : ""}
${context.priceRange ? `Budget: ${context.priceRange}` : ""}

Please provide specific, actionable gift suggestions. Return as a JSON array of strings.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: "You are a thoughtful gift advisor. Always respond with a valid JSON array of 5 gift suggestions.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message?.content || '{"suggestions": []}';
    try {
      const parsed = JSON.parse(content);
      return parsed.suggestions || parsed.gifts || [];
    } catch {
      return [];
    }
  });
}

/**
 * Generate relationship advice
 */
export async function getRelationshipAdvice(context: {
  relationType: string;
  situation: string;
  history?: string;
}): Promise<string> {
  const cacheKey = generateCacheKey("advice", JSON.stringify(context));

  return getCachedOrGenerate(cacheKey, async () => {
    const prompt = `Provide thoughtful relationship advice for someone in a ${context.relationType} relationship.

Situation: ${context.situation}
${context.history ? `Background: ${context.history}` : ""}

Please provide empathetic, practical advice.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content:
            "You are a compassionate relationship advisor. Provide thoughtful, practical advice that respects boundaries and promotes healthy communication.",
        },
        { role: "user", content: prompt },
      ],
    });

    return response.choices[0].message?.content || "";
  });
}

/**
 * Generate memory prompts/questions to help users capture memories
 */
export async function getMemoryPrompts(context: {
  personName: string;
  relationType: string;
  existingMemories?: string[];
}): Promise<string[]> {
  const cacheKey = generateCacheKey("prompts", JSON.stringify(context));

  return getCachedOrGenerate(cacheKey, async () => {
    const prompt = `Generate 5 thoughtful questions/prompts to help someone capture meaningful memories about ${context.personName} (their ${context.relationType}).
${context.existingMemories?.length ? `They've already recorded memories about: ${context.existingMemories.join(", ")}` : ""}

Return as a JSON array of strings with questions that encourage reflection and storytelling.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content:
            "You are a memory curator. Generate thoughtful prompts that help people capture meaningful moments and stories. Return a valid JSON object with a 'prompts' array.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message?.content || '{"prompts": []}';
    try {
      const parsed = JSON.parse(content);
      return parsed.prompts || parsed.questions || [];
    } catch {
      return [];
    }
  });
}

/**
 * Generate date/activity ideas
 */
export async function suggestActivities(context: {
  personName: string;
  relationType: string;
  occasion?: string;
  location?: string;
  preferences?: string[];
}): Promise<string[]> {
  const cacheKey = generateCacheKey("activities", JSON.stringify(context));

  return getCachedOrGenerate(cacheKey, async () => {
    const prompt = `Suggest 5 meaningful activities or date ideas for someone to do with ${context.personName} (their ${context.relationType}).
${context.occasion ? `Occasion: ${context.occasion}` : ""}
${context.location ? `Location: ${context.location}` : ""}
${context.preferences?.length ? `Preferences: ${context.preferences.join(", ")}` : ""}

Return as a JSON array of activity suggestions.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content:
            "You are a thoughtful activity planner. Suggest meaningful, memorable activities. Return a valid JSON object with an 'activities' array.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message?.content || '{"activities": []}';
    try {
      const parsed = JSON.parse(content);
      return parsed.activities || parsed.suggestions || [];
    } catch {
      return [];
    }
  });
}

/**
 * Generate a personalized message
 */
export async function generateMessage(context: {
  personName: string;
  relationType: string;
  occasion: string;
  tone?: "formal" | "casual" | "heartfelt" | "funny";
  additionalContext?: string;
}): Promise<string> {
  const cacheKey = generateCacheKey("message", JSON.stringify(context));

  return getCachedOrGenerate(cacheKey, async () => {
    const prompt = `Write a ${context.tone || "heartfelt"} message for ${context.personName} (${context.relationType}) for: ${context.occasion}.
${context.additionalContext ? `Additional context: ${context.additionalContext}` : ""}

Keep it personal and authentic.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content:
            "You are a thoughtful message writer. Write personal, authentic messages that feel genuine and heartfelt.",
        },
        { role: "user", content: prompt },
      ],
    });

    return response.choices[0].message?.content || "";
  });
}

