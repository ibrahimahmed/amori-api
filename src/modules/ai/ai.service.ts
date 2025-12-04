import {
  suggestGifts,
  getRelationshipAdvice,
  getMemoryPrompts,
  suggestActivities,
  generateMessage,
} from "../../libs/openai";
import { db } from "../../libs/db/client";

export class AIService {
  /**
   * Get gift suggestions for a person
   */
  async getGiftSuggestions(
    userId: string,
    personId: string,
    options?: { occasion?: string; priceRange?: string }
  ) {
    const person = await db
      .selectFrom("people")
      .selectAll()
      .where("id", "=", personId)
      .where("user_id", "=", userId)
      .executeTakeFirst();

    if (!person) {
      throw new Error("Person not found");
    }

    // Get person's interests from their memories/notes
    const memories = await db
      .selectFrom("memories")
      .select("tags")
      .where("person_id", "=", personId)
      .where("user_id", "=", userId)
      .execute();

    const interests = new Set<string>();
    for (const m of memories) {
      if (m.tags) {
        for (const tag of m.tags) {
          interests.add(tag);
        }
      }
    }

    return suggestGifts({
      personName: person.name,
      relationType: person.relation_type,
      occasion: options?.occasion,
      interests: Array.from(interests),
      priceRange: options?.priceRange,
    });
  }

  /**
   * Get relationship advice
   */
  async getAdvice(userId: string, personId: string | null, situation: string) {
    let relationType = "someone";
    let history: string | undefined;

    if (personId) {
      const person = await db
        .selectFrom("people")
        .selectAll()
        .where("id", "=", personId)
        .where("user_id", "=", userId)
        .executeTakeFirst();

      if (person) {
        relationType = person.relation_type;
        history = person.notes || undefined;
      }
    }

    return getRelationshipAdvice({
      relationType,
      situation,
      history,
    });
  }

  /**
   * Get memory prompts for a person
   */
  async getMemoryPromptsForPerson(userId: string, personId: string) {
    const person = await db
      .selectFrom("people")
      .selectAll()
      .where("id", "=", personId)
      .where("user_id", "=", userId)
      .executeTakeFirst();

    if (!person) {
      throw new Error("Person not found");
    }

    // Get existing memory titles
    const memories = await db
      .selectFrom("memories")
      .select("title")
      .where("person_id", "=", personId)
      .where("user_id", "=", userId)
      .execute();

    return getMemoryPrompts({
      personName: person.name,
      relationType: person.relation_type,
      existingMemories: memories.map((m) => m.title),
    });
  }

  /**
   * Get activity suggestions
   */
  async getActivitySuggestions(
    userId: string,
    personId: string,
    options?: { occasion?: string; location?: string; preferences?: string[] }
  ) {
    const person = await db
      .selectFrom("people")
      .selectAll()
      .where("id", "=", personId)
      .where("user_id", "=", userId)
      .executeTakeFirst();

    if (!person) {
      throw new Error("Person not found");
    }

    return suggestActivities({
      personName: person.name,
      relationType: person.relation_type,
      occasion: options?.occasion,
      location: options?.location,
      preferences: options?.preferences,
    });
  }

  /**
   * Generate a personalized message
   */
  async generatePersonalizedMessage(
    userId: string,
    personId: string,
    occasion: string,
    options?: { tone?: "formal" | "casual" | "heartfelt" | "funny"; additionalContext?: string }
  ) {
    const person = await db
      .selectFrom("people")
      .selectAll()
      .where("id", "=", personId)
      .where("user_id", "=", userId)
      .executeTakeFirst();

    if (!person) {
      throw new Error("Person not found");
    }

    return generateMessage({
      personName: person.name,
      relationType: person.relation_type,
      occasion,
      tone: options?.tone,
      additionalContext: options?.additionalContext,
    });
  }
}

export const aiService = new AIService();


