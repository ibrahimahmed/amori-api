import { db } from "../../libs/db/client";
import type { PlannerEventInsert, PlannerEventUpdate, EventType, PlannerEvent } from "../../libs/db/schema";
import { logger } from "../../libs/logger";
import { redis } from "../../libs/cache";
import type { Selectable } from "kysely";

/** Cache TTL in seconds */
const CACHE_TTL = {
  PLANNER_LIST: 300, // 5 minutes
  PLANNER_STATS: 300, // 5 minutes
  UPCOMING: 600, // 10 minutes
} as const;

/** Cache key patterns */
const CACHE_KEYS = {
  list: (userId: string) => `planner:list:${userId}`,
  upcoming: (userId: string, days: number) => `planner:upcoming:${userId}:${days}`,
  overdue: (userId: string) => `planner:overdue:${userId}`,
  stats: (userId: string) => `planner:stats:${userId}`,
  userPattern: (userId: string) => `planner:*:${userId}*`,
} as const;

export class ServiceError extends Error {
  constructor(
    message: string,
    public code: "NOT_FOUND" | "VALIDATION" | "DATABASE" | "INTERNAL",
    public statusCode: number = 500
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export interface PlannerFilters {
  personId?: string;
  eventType?: EventType;
  startDate?: Date;
  endDate?: Date;
  completed?: boolean;
}

export class PlannerService {
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
   * Get all events for a user
   */
  async getAll(userId: string, filters?: PlannerFilters) {
    try {
      // Only cache unfiltered results
      const cacheKey = !filters || Object.keys(filters).length === 0 || Object.values(filters).every(v => v === undefined) 
        ? CACHE_KEYS.list(userId) 
        : null;

      if (cacheKey) {
        const cached = await this.getFromCache<Selectable<PlannerEvent>[]>(cacheKey);
        if (cached) return cached;
      }

      let query = db.selectFrom("planner").selectAll().where("user_id", "=", userId);

      if (filters?.personId) {
        query = query.where("person_id", "=", filters.personId);
      }

      if (filters?.eventType) {
        query = query.where("event_type", "=", filters.eventType);
      }

      if (filters?.startDate) {
        query = query.where("date", ">=", filters.startDate);
      }

      if (filters?.endDate) {
        query = query.where("date", "<=", filters.endDate);
      }

      if (filters?.completed !== undefined) {
        query = query.where("completed", "=", filters.completed);
      }

      const events = await query.orderBy("date", "asc").execute();

      if (cacheKey) {
        await this.setCache(cacheKey, events, CACHE_TTL.PLANNER_LIST);
      }

      return events;
    } catch (error) {
      logger.error("Failed to get planner events", error as Error, { userId, filters });
      throw new ServiceError("Failed to retrieve events", "DATABASE", 500);
    }
  }

  /**
   * Get a single event by ID
   */
  async getById(userId: string, eventId: string) {
    try {
      return await db
        .selectFrom("planner")
        .selectAll()
        .where("id", "=", eventId)
        .where("user_id", "=", userId)
        .executeTakeFirst();
    } catch (error) {
      logger.error("Failed to get planner event by ID", error as Error, { userId, eventId });
      throw new ServiceError("Failed to retrieve event", "DATABASE", 500);
    }
  }

  /**
   * Create a new event
   */
  async create(data: PlannerEventInsert) {
    try {
      const event = await db.insertInto("planner").values(data).returningAll().executeTakeFirst();
      await this.invalidateUserCache(data.user_id);
      return event;
    } catch (error) {
      logger.error("Failed to create planner event", error as Error, { userId: data.user_id });
      throw new ServiceError("Failed to create event", "DATABASE", 500);
    }
  }

  /**
   * Update an event
   */
  async update(userId: string, eventId: string, data: PlannerEventUpdate) {
    try {
      const event = await db
        .updateTable("planner")
        .set(data)
        .where("id", "=", eventId)
        .where("user_id", "=", userId)
        .returningAll()
        .executeTakeFirst();
      
      if (event) {
        await this.invalidateUserCache(userId);
      }
      return event;
    } catch (error) {
      logger.error("Failed to update planner event", error as Error, { userId, eventId });
      throw new ServiceError("Failed to update event", "DATABASE", 500);
    }
  }

  /**
   * Delete an event
   */
  async delete(userId: string, eventId: string) {
    try {
      const result = await db
        .deleteFrom("planner")
        .where("id", "=", eventId)
        .where("user_id", "=", userId)
        .executeTakeFirst();

      const deleted = result.numDeletedRows > 0;
      if (deleted) {
        await this.invalidateUserCache(userId);
      }
      return deleted;
    } catch (error) {
      logger.error("Failed to delete planner event", error as Error, { userId, eventId });
      throw new ServiceError("Failed to delete event", "DATABASE", 500);
    }
  }

  /**
   * Mark event as completed
   */
  async markCompleted(userId: string, eventId: string, completed: boolean = true) {
    try {
      const event = await db
        .updateTable("planner")
        .set({
          completed,
          completed_at: completed ? new Date() : null,
        })
        .where("id", "=", eventId)
        .where("user_id", "=", userId)
        .returningAll()
        .executeTakeFirst();
      
      if (event) {
        await this.invalidateUserCache(userId);
      }
      return event;
    } catch (error) {
      logger.error("Failed to mark planner event as completed", error as Error, { userId, eventId, completed });
      throw new ServiceError("Failed to update event completion status", "DATABASE", 500);
    }
  }

  /**
   * Get upcoming events
   */
  async getUpcoming(userId: string, daysAhead: number = 7) {
    try {
      const cacheKey = CACHE_KEYS.upcoming(userId, daysAhead);
      const cached = await this.getFromCache<Selectable<PlannerEvent>[]>(cacheKey);
      if (cached) return cached;

      const now = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + daysAhead);

      const events = await db
        .selectFrom("planner")
        .selectAll()
        .where("user_id", "=", userId)
        .where("date", ">=", now)
        .where("date", "<=", endDate)
        .where("completed", "=", false)
        .orderBy("date", "asc")
        .execute();

      await this.setCache(cacheKey, events, CACHE_TTL.UPCOMING);
      return events;
    } catch (error) {
      logger.error("Failed to get upcoming planner events", error as Error, { userId, daysAhead });
      throw new ServiceError("Failed to retrieve upcoming events", "DATABASE", 500);
    }
  }

  /**
   * Get overdue events
   */
  async getOverdue(userId: string) {
    try {
      const cacheKey = CACHE_KEYS.overdue(userId);
      const cached = await this.getFromCache<Selectable<PlannerEvent>[]>(cacheKey);
      if (cached) return cached;

      const now = new Date();

      const events = await db
        .selectFrom("planner")
        .selectAll()
        .where("user_id", "=", userId)
        .where("date", "<", now)
        .where("completed", "=", false)
        .orderBy("date", "asc")
        .execute();

      await this.setCache(cacheKey, events, CACHE_TTL.UPCOMING); // Reuse short TTL
      return events;
    } catch (error) {
      logger.error("Failed to get overdue planner events", error as Error, { userId });
      throw new ServiceError("Failed to retrieve overdue events", "DATABASE", 500);
    }
  }

  /**
   * Get events for a specific date
   */
  async getByDate(userId: string, date: Date) {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      return await db
        .selectFrom("planner")
        .selectAll()
        .where("user_id", "=", userId)
        .where("date", ">=", startOfDay)
        .where("date", "<=", endOfDay)
        .orderBy("date", "asc")
        .execute();
    } catch (error) {
      logger.error("Failed to get planner events by date", error as Error, { userId, date });
      throw new ServiceError("Failed to retrieve events for date", "DATABASE", 500);
    }
  }

  /**
   * Get events for a month (calendar view)
   */
  async getByMonth(userId: string, year: number, month: number) {
    try {
      const startOfMonth = new Date(year, month - 1, 1);
      const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

      return await db
        .selectFrom("planner")
        .selectAll()
        .where("user_id", "=", userId)
        .where("date", ">=", startOfMonth)
        .where("date", "<=", endOfMonth)
        .orderBy("date", "asc")
        .execute();
    } catch (error) {
      logger.error("Failed to get planner events by month", error as Error, { userId, year, month });
      throw new ServiceError("Failed to retrieve events for month", "DATABASE", 500);
    }
  }

  /**
   * Get events that need reminders sent
   */
  async getEventsNeedingReminders() {
    try {
      const now = new Date();
      const buffer = new Date(now.getTime() + 5 * 60 * 1000); // 5 minute buffer

      return await db
        .selectFrom("planner")
        .selectAll()
        .where("reminder_at", "<=", buffer)
        .where("reminder_at", ">=", now)
        .where("completed", "=", false)
        .execute();
    } catch (error) {
      logger.error("Failed to get events needing reminders", error as Error);
      throw new ServiceError("Failed to retrieve events needing reminders", "DATABASE", 500);
    }
  }

  /**
   * Get statistics for a user
   */
  async getStats(userId: string) {
    try {
      const events = await db
        .selectFrom("planner")
        .select(["completed", "event_type"])
        .where("user_id", "=", userId)
        .execute();

      const total = events.length;
      const completed = events.filter((e) => e.completed).length;
      const pending = total - completed;

      const byType: Record<string, number> = {};
      for (const event of events) {
        byType[event.event_type] = (byType[event.event_type] || 0) + 1;
      }

      return {
        total,
        completed,
        pending,
        byType,
      };
    } catch (error) {
      logger.error("Failed to get planner stats", error as Error, { userId });
      throw new ServiceError("Failed to retrieve statistics", "DATABASE", 500);
    }
  }
}

export const plannerService = new PlannerService();
