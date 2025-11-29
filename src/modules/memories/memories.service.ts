import { db } from "../../libs/db/client";
import { uploadFile, deleteFile, STORAGE_BUCKETS } from "../../libs/supabase";
import type { Memory, MemoryInsert, MemoryUpdate } from "../../libs/db/schema";
import { logger } from "../../libs/logger";
import { redis } from "../../libs/cache";
import type { Selectable } from "kysely";

/** Cache TTL in seconds */
const CACHE_TTL = {
  LIST: 300, // 5 minutes
  FAVORITES: 300, // 5 minutes
  TAGS: 600, // 10 minutes
} as const;

/** Cache key patterns */
const CACHE_KEYS = {
  list: (userId: string) => `memories:list:${userId}`,
  favorites: (userId: string) => `memories:favorites:${userId}`,
  tags: (userId: string) => `memories:tags:${userId}`,
  userPattern: (userId: string) => `memories:*:${userId}*`,
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

export interface MemoryFilters {
  personId?: string;
  startDate?: Date;
  endDate?: Date;
  tags?: string[];
  isFavorite?: boolean;
}

export class MemoriesService {
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
   * Get all memories for a user
   */
  async getAll(userId: string, filters?: MemoryFilters) {
    try {
      // Only cache unfiltered results (except for simple userId filter which is implicit)
      // or if checks are specific enough to be worth caching separately (but typically we cache the base list)
      // For simplicity, we cache the base list (no filters)
      const cacheKey = !filters || Object.keys(filters).length === 0 || Object.values(filters).every(v => v === undefined)
        ? CACHE_KEYS.list(userId)
        : null;

      if (cacheKey) {
        const cached = await this.getFromCache<Selectable<Memory>[]>(cacheKey);
        if (cached) return cached;
      }

      let query = db.selectFrom("memories").selectAll().where("user_id", "=", userId);

      if (filters?.personId) {
        query = query.where("person_id", "=", filters.personId);
      }

      if (filters?.startDate) {
        query = query.where("date", ">=", filters.startDate);
      }

      if (filters?.endDate) {
        query = query.where("date", "<=", filters.endDate);
      }

      if (filters?.isFavorite !== undefined) {
        query = query.where("is_favorite", "=", filters.isFavorite);
      }

      const memories = await query.orderBy("date", "desc").orderBy("created_at", "desc").execute();

      let result = memories;
      // Filter by tags in application layer if needed
      if (filters?.tags?.length) {
        result = memories.filter((m) => m.tags?.some((t) => filters.tags!.includes(t)));
      }

      if (cacheKey) {
        await this.setCache(cacheKey, result, CACHE_TTL.LIST);
      }

      return result;
    } catch (error) {
      logger.error("Failed to get memories", error as Error, { userId, filters });
      throw new ServiceError("Failed to retrieve memories", "DATABASE", 500);
    }
  }

  /**
   * Get a single memory by ID
   */
  async getById(userId: string, memoryId: string) {
    try {
      return await db
        .selectFrom("memories")
        .selectAll()
        .where("id", "=", memoryId)
        .where("user_id", "=", userId)
        .executeTakeFirst();
    } catch (error) {
      logger.error("Failed to get memory by ID", error as Error, { userId, memoryId });
      throw new ServiceError("Failed to retrieve memory", "DATABASE", 500);
    }
  }

  /**
   * Create a new memory
   */
  async create(data: MemoryInsert) {
    try {
      const memory = await db.insertInto("memories").values(data as any).returningAll().executeTakeFirst();
      await this.invalidateUserCache(data.user_id);
      return memory;
    } catch (error) {
      logger.error("Failed to create memory", error as Error, { userId: data.user_id });
      throw new ServiceError("Failed to create memory", "DATABASE", 500);
    }
  }

  /**
   * Update a memory
   */
  async update(userId: string, memoryId: string, data: MemoryUpdate) {
    try {
      const memory = await db
        .updateTable("memories")
        .set(data)
        .where("id", "=", memoryId)
        .where("user_id", "=", userId)
        .returningAll()
        .executeTakeFirst();
      
      if (memory) {
        await this.invalidateUserCache(userId);
      }
      return memory;
    } catch (error) {
      logger.error("Failed to update memory", error as Error, { userId, memoryId });
      throw new ServiceError("Failed to update memory", "DATABASE", 500);
    }
  }

  /**
   * Delete a memory and its associated files
   */
  async delete(userId: string, memoryId: string) {
    try {
      // Get the memory first to delete associated files
      const memory = await this.getById(userId, memoryId);

      if (!memory) {
        return false;
      }

      // Delete associated media files from storage
      if (memory.media_urls?.length) {
        for (const url of memory.media_urls) {
          // Extract path from URL
          const path = this.extractPathFromUrl(url);
          if (path) {
            await deleteFile(STORAGE_BUCKETS.MEMORIES, path);
          }
        }
      }

      const result = await db
        .deleteFrom("memories")
        .where("id", "=", memoryId)
        .where("user_id", "=", userId)
        .executeTakeFirst();

      const deleted = result.numDeletedRows > 0;
      if (deleted) {
        await this.invalidateUserCache(userId);
      }
      return deleted;
    } catch (error) {
      logger.error("Failed to delete memory", error as Error, { userId, memoryId });
      throw new ServiceError("Failed to delete memory", "DATABASE", 500);
    }
  }

  /**
   * Upload media file for a memory
   */
  async uploadMedia(userId: string, memoryId: string, file: File): Promise<string | null> {
    try {
      const memory = await this.getById(userId, memoryId);

      if (!memory) {
        return null;
      }

      const ext = file.name.split(".").pop() || "bin";
      const path = `${userId}/${memoryId}/${Date.now()}.${ext}`;

      const { url, error } = await uploadFile(STORAGE_BUCKETS.MEMORIES, path, file, {
        contentType: file.type,
        upsert: false,
      });

      if (error || !url) {
        logger.error("Failed to upload file", error as unknown as Error, { userId, memoryId });
        return null;
      }

      // Add URL to memory's media_urls
      const currentUrls = memory.media_urls || [];
      await this.update(userId, memoryId, {
        media_urls: [...currentUrls, url],
      });

      await this.invalidateUserCache(userId);
      return url;
    } catch (error) {
      logger.error("Failed to upload media", error as Error, { userId, memoryId });
      throw new ServiceError("Failed to upload media", "INTERNAL", 500);
    }
  }

  /**
   * Remove a media file from a memory
   */
  async removeMedia(userId: string, memoryId: string, mediaUrl: string) {
    try {
      const memory = await this.getById(userId, memoryId);

      if (!memory) {
        return false;
      }

      // Delete from storage
      const path = this.extractPathFromUrl(mediaUrl);
      if (path) {
        await deleteFile(STORAGE_BUCKETS.MEMORIES, path);
      }

      // Remove from memory's media_urls
      const updatedUrls = (memory.media_urls || []).filter((url) => url !== mediaUrl);
      await this.update(userId, memoryId, { media_urls: updatedUrls });

      await this.invalidateUserCache(userId);
      return true;
    } catch (error) {
      logger.error("Failed to remove media", error as Error, { userId, memoryId });
      throw new ServiceError("Failed to remove media", "INTERNAL", 500);
    }
  }

  /**
   * Toggle favorite status
   */
  async toggleFavorite(userId: string, memoryId: string) {
    try {
      const memory = await this.getById(userId, memoryId);

      if (!memory) {
        return null;
      }

      const updated = await this.update(userId, memoryId, { is_favorite: !memory.is_favorite });
      if (updated) {
        await this.invalidateUserCache(userId);
      }
      return updated;
    } catch (error) {
      logger.error("Failed to toggle favorite", error as Error, { userId, memoryId });
      throw new ServiceError("Failed to toggle favorite", "DATABASE", 500);
    }
  }

  /**
   * Get all unique tags used by a user
   */
  async getAllTags(userId: string): Promise<string[]> {
    try {
      const cacheKey = CACHE_KEYS.tags(userId);
      const cached = await this.getFromCache<string[]>(cacheKey);
      if (cached) return cached;

      const memories = await db
        .selectFrom("memories")
        .select("tags")
        .where("user_id", "=", userId)
        .where("tags", "is not", null)
        .execute();

      const allTags = new Set<string>();
      for (const m of memories) {
        if (m.tags) {
          for (const tag of m.tags) {
            allTags.add(tag);
          }
        }
      }

      const result = Array.from(allTags).sort();
      await this.setCache(cacheKey, result, CACHE_TTL.TAGS);
      return result;
    } catch (error) {
      logger.error("Failed to get tags", error as Error, { userId });
      throw new ServiceError("Failed to retrieve tags", "DATABASE", 500);
    }
  }

  /**
   * Get favorite memories
   */
  async getFavorites(userId: string) {
    try {
      const cacheKey = CACHE_KEYS.favorites(userId);
      const cached = await this.getFromCache<Selectable<Memory>[]>(cacheKey);
      if (cached) return cached;

      const favorites = await db
        .selectFrom("memories")
        .selectAll()
        .where("user_id", "=", userId)
        .where("is_favorite", "=", true)
        .orderBy("date", "desc")
        .execute();
      
      await this.setCache(cacheKey, favorites, CACHE_TTL.FAVORITES);
      return favorites;
    } catch (error) {
      logger.error("Failed to get favorites", error as Error, { userId });
      throw new ServiceError("Failed to retrieve favorites", "DATABASE", 500);
    }
  }

  /**
   * Extract storage path from full URL
   */
  private extractPathFromUrl(url: string): string | null {
    try {
      // URL format: https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
      const match = url.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }
}

export const memoriesService = new MemoriesService();