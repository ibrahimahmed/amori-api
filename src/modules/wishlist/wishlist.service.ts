import { db } from "../../libs/db/client";
import type { WishlistItemInsert, WishlistItemUpdate, Priority, WishlistItem } from "../../libs/db/schema";
import { logger } from "../../libs/logger";
import { redis } from "../../libs/cache";
import type { Selectable } from "kysely";

/** Cache TTL in seconds */
const CACHE_TTL = {
  WISHLIST_LIST: 300, // 5 minutes
  WISHLIST_GROUPED: 300, // 5 minutes
  WISHLIST_HISTORY: 300, // 5 minutes
} as const;

/** Cache key patterns */
const CACHE_KEYS = {
  list: (userId: string) => `wishlist:list:${userId}`,
  grouped: (userId: string) => `wishlist:grouped:${userId}`,
  history: (userId: string) => `wishlist:history:${userId}`,
  userPattern: (userId: string) => `wishlist:*:${userId}*`,
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

export interface WishlistFilters {
  personId?: string;
  priority?: Priority;
  purchased?: boolean;
}

export class WishlistService {
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
   * Get all wishlist items for a user
   */
  async getAll(userId: string, filters?: WishlistFilters) {
    try {
      // Only cache unfiltered results
      const cacheKey = !filters || Object.keys(filters).length === 0 || Object.values(filters).every(v => v === undefined)
        ? CACHE_KEYS.list(userId)
        : null;

      if (cacheKey) {
        const cached = await this.getFromCache<Selectable<WishlistItem>[]>(cacheKey);
        if (cached) return cached;
      }

      let query = db.selectFrom("wishlist").selectAll().where("user_id", "=", userId);

      if (filters?.personId) {
        query = query.where("person_id", "=", filters.personId);
      }

      if (filters?.priority) {
        query = query.where("priority", "=", filters.priority);
      }

      if (filters?.purchased !== undefined) {
        query = query.where("purchased", "=", filters.purchased);
      }

      const items = await query.orderBy("priority", "desc").orderBy("created_at", "desc").execute();

      if (cacheKey) {
        await this.setCache(cacheKey, items, CACHE_TTL.WISHLIST_LIST);
      }

      return items;
    } catch (error) {
      logger.error("Failed to get wishlist items", error as Error, { userId, filters });
      throw new ServiceError("Failed to retrieve items", "DATABASE", 500);
    }
  }

  /**
   * Get a single wishlist item by ID
   */
  async getById(userId: string, itemId: string) {
    try {
      return await db
        .selectFrom("wishlist")
        .selectAll()
        .where("id", "=", itemId)
        .where("user_id", "=", userId)
        .executeTakeFirst();
    } catch (error) {
      logger.error("Failed to get wishlist item by ID", error as Error, { userId, itemId });
      throw new ServiceError("Failed to retrieve item", "DATABASE", 500);
    }
  }

  /**
   * Create a new wishlist item
   */
  async create(data: WishlistItemInsert) {
    try {
      const item = await db.insertInto("wishlist").values(data as any).returningAll().executeTakeFirst();
      await this.invalidateUserCache(data.user_id);
      return item;
    } catch (error) {
      logger.error("Failed to create wishlist item", error as Error, { userId: data.user_id });
      throw new ServiceError("Failed to create item", "DATABASE", 500);
    }
  }

  /**
   * Update a wishlist item
   */
  async update(userId: string, itemId: string, data: WishlistItemUpdate) {
    try {
      const item = await db
        .updateTable("wishlist")
        .set(data)
        .where("id", "=", itemId)
        .where("user_id", "=", userId)
        .returningAll()
        .executeTakeFirst();
      
      if (item) {
        await this.invalidateUserCache(userId);
      }
      return item;
    } catch (error) {
      logger.error("Failed to update wishlist item", error as Error, { userId, itemId });
      throw new ServiceError("Failed to update item", "DATABASE", 500);
    }
  }

  /**
   * Delete a wishlist item
   */
  async delete(userId: string, itemId: string) {
    try {
      const result = await db
        .deleteFrom("wishlist")
        .where("id", "=", itemId)
        .where("user_id", "=", userId)
        .executeTakeFirst();

      const deleted = result.numDeletedRows > 0;
      if (deleted) {
        await this.invalidateUserCache(userId);
      }
      return deleted;
    } catch (error) {
      logger.error("Failed to delete wishlist item", error as Error, { userId, itemId });
      throw new ServiceError("Failed to delete item", "DATABASE", 500);
    }
  }

  /**
   * Mark item as purchased
   */
  async markPurchased(userId: string, itemId: string, purchased: boolean = true) {
    try {
      const item = await db
        .updateTable("wishlist")
        .set({
          purchased,
          purchased_at: purchased ? new Date() : null,
        })
        .where("id", "=", itemId)
        .where("user_id", "=", userId)
        .returningAll()
        .executeTakeFirst();
      
      if (item) {
        await this.invalidateUserCache(userId);
      }
      return item;
    } catch (error) {
      logger.error("Failed to mark wishlist item purchased", error as Error, { userId, itemId, purchased });
      throw new ServiceError("Failed to update purchase status", "DATABASE", 500);
    }
  }

  /**
   * Get items grouped by person
   */
  async getGroupedByPerson(userId: string) {
    try {
      const cacheKey = CACHE_KEYS.grouped(userId);
      const cached = await this.getFromCache<Record<string, Selectable<WishlistItem>[]>>(cacheKey);
      if (cached) return cached;

      const items = await this.getAll(userId);

      const grouped: Record<string, typeof items> = {
        unassigned: [],
      };

      for (const item of items) {
        if (item.person_id) {
          if (!grouped[item.person_id]) {
            grouped[item.person_id] = [];
          }
          grouped[item.person_id].push(item);
        } else {
          grouped.unassigned.push(item);
        }
      }

      await this.setCache(cacheKey, grouped, CACHE_TTL.WISHLIST_GROUPED);
      return grouped;
    } catch (error) {
      logger.error("Failed to get grouped wishlist items", error as Error, { userId });
      throw new ServiceError("Failed to retrieve grouped items", "DATABASE", 500);
    }
  }

  /**
   * Get unpurchased items for a person
   */
  async getUnpurchasedForPerson(userId: string, personId: string) {
    try {
      return await db
        .selectFrom("wishlist")
        .selectAll()
        .where("user_id", "=", userId)
        .where("person_id", "=", personId)
        .where("purchased", "=", false)
        .orderBy("priority", "desc")
        .execute();
    } catch (error) {
      logger.error("Failed to get unpurchased items for person", error as Error, { userId, personId });
      throw new ServiceError("Failed to retrieve person items", "DATABASE", 500);
    }
  }

  /**
   * Get purchase history
   */
  async getPurchaseHistory(userId: string) {
    try {
      const cacheKey = CACHE_KEYS.history(userId);
      const cached = await this.getFromCache<Selectable<WishlistItem>[]>(cacheKey);
      if (cached) return cached;

      const items = await db
        .selectFrom("wishlist")
        .selectAll()
        .where("user_id", "=", userId)
        .where("purchased", "=", true)
        .orderBy("purchased_at", "desc")
        .execute();

      await this.setCache(cacheKey, items, CACHE_TTL.WISHLIST_HISTORY);
      return items;
    } catch (error) {
      logger.error("Failed to get purchase history", error as Error, { userId });
      throw new ServiceError("Failed to retrieve history", "DATABASE", 500);
    }
  }
}

export const wishlistService = new WishlistService();

