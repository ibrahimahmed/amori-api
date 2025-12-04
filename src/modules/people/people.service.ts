import { db } from "../../libs/db/client";
import { sql } from "kysely";
import type { Selectable } from "kysely";
import type { PersonInsert, PersonUpdate, RelationType, Memory, PlannerEvent, WishlistItem } from "../../libs/db/schema";
import { logger } from "../../libs/logger";
import { redis } from "../../libs/cache";

/** Cache TTL in seconds */
const CACHE_TTL = {
  PEOPLE_LIST: 3000, // 50 minutes
  PERSON_PROFILE: 3000, // 50 minutes
  UPCOMING_EVENTS: 600, // 10 minutes (changes frequently based on date calculations)
} as const;

/** Cache key patterns */
const CACHE_KEYS = {
  peopleList: (userId: string) => `people:list:${userId}`,
  personProfile: (userId: string, personId: string) => `people:profile:${userId}:${personId}`,
  upcomingEvents: (userId: string, days: number) => `people:upcoming:${userId}:${days}`,
  userPattern: (userId: string) => `people:*:${userId}*`,
} as const;

export class ServiceError extends Error {
  constructor(
    message: string,
    public code: "NOT_FOUND" | "VALIDATION" | "DATABASE" | "INTERNAL" | "CACHE",
    public statusCode: number = 500
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export interface PersonProfile {
  person: Selectable<import("../../libs/db/schema").Person>;
  memories: Selectable<Memory>[];
  upcomingPlans: Selectable<PlannerEvent>[];
  wishlist: Selectable<WishlistItem>[];
  daysUntilBirthday: number | null;
  daysUntilAnniversary: { days: number; years: number } | null;
}

export interface UpcomingBirthday {
  person: Selectable<import("../../libs/db/schema").Person>;
  daysUntil: number;
}

export interface UpcomingAnniversary {
  person: Selectable<import("../../libs/db/schema").Person>;
  daysUntil: number;
  years: number;
}

export interface UpcomingMemory {
  memory: Selectable<Memory>;
  daysUntil: number;
  years: number;
}

export interface UpcomingEvents {
  birthdays: UpcomingBirthday[];
  anniversaries: UpcomingAnniversary[];
  upcomingMemories: UpcomingMemory[];
  upcomingPlans: Selectable<PlannerEvent>[];
}

export class PeopleService {
  /**
   * Get cached data or fetch from source
   */
  private async getFromCache<T>(key: string): Promise<T | null> {
    try {
      const cached = await redis.get(key);
      if (cached) {
        logger.debug("Cache hit", { key });
        return JSON.parse(cached) as T;
      }
      return null;
    } catch (error) {
      logger.warn("Cache read error", { key, error: (error as Error).message });
      return null;
    }
  }

  /**
   * Set data in cache
   */
  private async setCache<T>(key: string, data: T, ttl: number): Promise<void> {
    try {
      await redis.setex(key, ttl, JSON.stringify(data));
      logger.debug("Cache set", { key, ttl });
    } catch (error) {
      logger.warn("Cache write error", { key, error: (error as Error).message });
    }
  }

  /**
   * Invalidate cache by pattern for a user
   */
  private async invalidateUserCache(userId: string): Promise<void> {
    try {
      const keys = await redis.keys(CACHE_KEYS.userPattern(userId));
      if (keys.length > 0) {
        await redis.del(...keys);
        logger.debug("Cache invalidated", { userId, keysCount: keys.length });
      }
    } catch (error) {
      logger.warn("Cache invalidation error", { userId, error: (error as Error).message });
    }
  }

  /**
   * Invalidate specific cache keys
   */
  private async invalidateKeys(...keys: string[]): Promise<void> {
    try {
      if (keys.length > 0) {
        await redis.del(...keys);
        logger.debug("Cache keys invalidated", { keys });
      }
    } catch (error) {
      logger.warn("Cache invalidation error", { keys, error: (error as Error).message });
    }
  }

  /**
   * Get all people for a user (cached)
   */
  async getAll(userId: string, filters?: { relationType?: RelationType }) {
    try {
      // Only cache unfiltered results
      const cacheKey = !filters?.relationType ? CACHE_KEYS.peopleList(userId) : null;
      if (cacheKey) {
        const cached = await this.getFromCache<Selectable<import("../../libs/db/schema").Person>[]>(cacheKey);
        if (cached) return cached;
      }
      let query = db.selectFrom("people").selectAll().where("user_id", "=", userId);
      if (filters?.relationType) {
        query = query.where("relation_type", "=", filters.relationType);
      }
      const people = await query.orderBy("name", "asc").execute();
      if (cacheKey) {
        await this.setCache(cacheKey, people, CACHE_TTL.PEOPLE_LIST);
      }
      logger.debug("Fetched people list from DB", { userId });
      return people;
    } catch (error) {
      logger.error("Failed to fetch people", error as Error, { userId });
      throw new ServiceError("Failed to fetch people", "DATABASE", 500);
    }
  }

  /**
   * Get a single person by ID (no cache - use getFullProfile for cached version)
   */
  async getById(userId: string, personId: string) {
    try {
      const person = await db
        .selectFrom("people")
        .selectAll()
        .where("id", "=", personId)
        .where("user_id", "=", userId)
        .executeTakeFirst();
      return person;
    } catch (error) {
      logger.error("Failed to fetch person by ID", error as Error, { userId });
      throw new ServiceError("Failed to fetch person", "DATABASE", 500);
    }
  }

  /**
   * Create a new person and invalidate cache
   */
  async create(data: PersonInsert) {
    try {
      const person = await db.insertInto("people").values(data).returningAll().executeTakeFirst();
      // Invalidate user's cache
      await this.invalidateUserCache(data.user_id);
      logger.info("Created new person", { userId: data.user_id });
      return person;
    } catch (error) {
      logger.error("Failed to create person", error as Error, { userId: data.user_id });
      throw new ServiceError("Failed to create person", "DATABASE", 500);
    }
  }

  /**
   * Update a person and invalidate cache
   */
  async update(userId: string, personId: string, data: PersonUpdate) {
    try {
      const person = await db
        .updateTable("people")
        .set(data)
        .where("id", "=", personId)
        .where("user_id", "=", userId)
        .returningAll()
        .executeTakeFirst();
      if (person) {
        // Invalidate user's cache
        await this.invalidateUserCache(userId);
        logger.info("Updated person", { userId });
      }
      return person;
    } catch (error) {
      logger.error("Failed to update person", error as Error, { userId });
      throw new ServiceError("Failed to update person", "DATABASE", 500);
    }
  }

  /**
   * Delete a person and all associated data (memories, plans, wishlist)
   * Uses single query with CTEs for optimal performance
   */
  async delete(userId: string, personId: string) {
    try {
      const result = await sql<{ deleted_id: string | null }>`
        WITH
          delete_memories AS (
            DELETE FROM memories WHERE user_id = ${userId} AND person_id = ${personId}
          ),
          delete_planner AS (
            DELETE FROM planner WHERE user_id = ${userId} AND person_id = ${personId}
          ),
          delete_wishlist AS (
            DELETE FROM wishlist WHERE user_id = ${userId} AND person_id = ${personId}
          ),
          delete_person AS (
            DELETE FROM people WHERE id = ${personId} AND user_id = ${userId} RETURNING id
          )
        SELECT id as deleted_id FROM delete_person
      `.execute(db);
      const deleted = result.rows.length > 0 && result.rows[0].deleted_id !== null;
      if (deleted) {
        // Invalidate user's cache
        await this.invalidateUserCache(userId);
        logger.info("Deleted person and associated data", { userId });
      }
      return deleted;
    } catch (error) {
      logger.error("Failed to delete person", error as Error, { userId });
      throw new ServiceError("Failed to delete person", "DATABASE", 500);
    }
  }

  /**
   * Get upcoming events: birthdays, anniversaries, memory anniversaries, and upcoming plans (cached)
   * Uses single query with JSON aggregation for optimal performance
   */
  async getUpcomingEvents(userId: string, daysAhead: number = 30): Promise<UpcomingEvents> {
    try {
      const cacheKey = CACHE_KEYS.upcomingEvents(userId, daysAhead);
      const cached = await this.getFromCache<UpcomingEvents>(cacheKey);
      if (cached) return cached;
      const today = new Date();
      const futureDate = new Date(today);
      futureDate.setDate(futureDate.getDate() + daysAhead);
      const result = await sql<{
        people: Selectable<import("../../libs/db/schema").Person>[];
        memories: Selectable<Memory>[];
        upcoming_plans: Selectable<PlannerEvent>[];
      }>`
        SELECT
          COALESCE((SELECT json_agg(p.*) FROM people p WHERE p.user_id = ${userId}), '[]'::json) as people,
          COALESCE((SELECT json_agg(m.*) FROM memories m WHERE m.user_id = ${userId} AND m.date IS NOT NULL), '[]'::json) as memories,
          COALESCE(
            (SELECT json_agg(pl.* ORDER BY pl.date ASC)
             FROM planner pl WHERE pl.user_id = ${userId} AND pl.date >= ${today} AND pl.date <= ${futureDate} AND pl.completed = false),
            '[]'::json
          ) as upcoming_plans
      `.execute(db);
      const data = result.rows[0];
      const people = data?.people ?? [];
      const memories = data?.memories ?? [];
      const upcomingPlans = data?.upcoming_plans ?? [];
      const calcDays = (date: Date | string) => this.calculateDaysUntil(new Date(date), today);
      const calcYears = (date: Date | string) => this.calculateYears(new Date(date), today);
      const { birthdays, anniversaries } = people.reduce<{
        birthdays: UpcomingBirthday[];
        anniversaries: UpcomingAnniversary[];
      }>(
        (acc, person) => {
          if (person.birthday) {
            const daysUntil = calcDays(person.birthday);
            if (daysUntil <= daysAhead) acc.birthdays.push({ person, daysUntil });
          }
          if (person.anniversary) {
            const daysUntil = calcDays(person.anniversary);
            if (daysUntil <= daysAhead) acc.anniversaries.push({ person, daysUntil, years: calcYears(person.anniversary) });
          }
          return acc;
        },
        { birthdays: [], anniversaries: [] }
      );
      const upcomingMemories = memories
        .filter((m) => m.date && calcYears(m.date) > 0 && calcDays(m.date) <= daysAhead)
        .map((memory) => ({ memory, daysUntil: calcDays(memory.date!), years: calcYears(memory.date!) }));
      const sortByDays = <T extends { daysUntil: number }>(a: T, b: T) => a.daysUntil - b.daysUntil;
      const events: UpcomingEvents = {
        birthdays: birthdays.sort(sortByDays),
        anniversaries: anniversaries.sort(sortByDays),
        upcomingMemories: upcomingMemories.sort(sortByDays),
        upcomingPlans,
      };
      await this.setCache(cacheKey, events, CACHE_TTL.UPCOMING_EVENTS);
      logger.debug("Fetched upcoming events from DB", { userId });
      return events;
    } catch (error) {
      logger.error("Failed to fetch upcoming events", error as Error, { userId });
      throw new ServiceError("Failed to fetch upcoming events", "DATABASE", 500);
    }
  }

  /**
   * Calculate days until a recurring date (birthday/anniversary)
   */
  private calculateDaysUntil(date: Date, today: Date): number {
    const d = new Date(date);
    const thisYear = new Date(today.getFullYear(), d.getMonth(), d.getDate());
    if (thisYear < today) {
      thisYear.setFullYear(thisYear.getFullYear() + 1);
    }
    return Math.ceil((thisYear.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }

  /**
   * Calculate years since a date
   */
  private calculateYears(date: Date, today: Date): number {
    const d = new Date(date);
    const thisYear = new Date(today.getFullYear(), d.getMonth(), d.getDate());
    if (thisYear < today) {
      thisYear.setFullYear(thisYear.getFullYear() + 1);
    }
    return thisYear.getFullYear() - d.getFullYear();
  }

  /**
   * Get full profile of a person including memories, upcoming plans, and wishlist (cached)
   * Uses single query with JSON aggregation for optimal performance
   */
  async getFullProfile(userId: string, personId: string): Promise<PersonProfile | null> {
    try {
      const cacheKey = CACHE_KEYS.personProfile(userId, personId);
      const cached = await this.getFromCache<PersonProfile>(cacheKey);
      if (cached) return cached;
      const now = new Date();
      const result = await sql<{
        person: Selectable<import("../../libs/db/schema").Person> | null;
        memories: Selectable<Memory>[];
        upcoming_plans: Selectable<PlannerEvent>[];
        wishlist: Selectable<WishlistItem>[];
      }>`
        SELECT 
          (SELECT row_to_json(p.*) FROM people p WHERE p.id = ${personId} AND p.user_id = ${userId}) as person,
          COALESCE(
            (SELECT json_agg(m.* ORDER BY m.date DESC NULLS LAST, m.created_at DESC)
             FROM memories m WHERE m.user_id = ${userId} AND m.person_id = ${personId}),
            '[]'::json
          ) as memories,
          COALESCE(
            (SELECT json_agg(pl.* ORDER BY pl.date ASC)
             FROM planner pl WHERE pl.user_id = ${userId} AND pl.person_id = ${personId} 
             AND pl.date >= ${now} AND pl.completed = false),
            '[]'::json
          ) as upcoming_plans,
          COALESCE(
            (SELECT json_agg(w.* ORDER BY w.priority DESC, w.created_at DESC)
             FROM wishlist w WHERE w.user_id = ${userId} AND w.person_id = ${personId}),
            '[]'::json
          ) as wishlist
      `.execute(db);
      const data = result.rows[0];
      if (!data?.person) {
        logger.debug("Person not found", { userId });
        return null;
      }
      const person = data.person;
      const daysUntilBirthday = person.birthday ? this.calculateDaysUntil(new Date(person.birthday), now) : null;
      const daysUntilAnniversary = person.anniversary
        ? {
            days: this.calculateDaysUntil(new Date(person.anniversary), now),
            years: this.calculateYears(new Date(person.anniversary), now),
          }
        : null;
      const profile: PersonProfile = {
        person,
        memories: data.memories,
        upcomingPlans: data.upcoming_plans,
        wishlist: data.wishlist,
        daysUntilBirthday,
        daysUntilAnniversary,
      };
      await this.setCache(cacheKey, profile, CACHE_TTL.PERSON_PROFILE);
      logger.debug("Fetched person profile from DB", { userId });
      return profile;
    } catch (error) {
      logger.error("Failed to fetch person profile", error as Error, { userId });
      throw new ServiceError("Failed to fetch person profile", "DATABASE", 500);
    }
  }

  /**
   * Manually invalidate all cache for a user (useful for admin or testing)
   */
  async invalidateCache(userId: string): Promise<void> {
    await this.invalidateUserCache(userId);
    logger.info("Manually invalidated cache", { userId });
  }
}

export const peopleService = new PeopleService();


