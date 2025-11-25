import { db } from "../../libs/db/client";
import { uploadFile, deleteFile, STORAGE_BUCKETS } from "../../libs/supabase";
import type { MemoryInsert, MemoryUpdate } from "../../libs/db/schema";

export interface MemoryFilters {
  personId?: string;
  startDate?: Date;
  endDate?: Date;
  tags?: string[];
  isFavorite?: boolean;
}

export class MemoriesService {
  /**
   * Get all memories for a user
   */
  async getAll(userId: string, filters?: MemoryFilters) {
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

    // Note: tag filtering would need array overlap which is PostgreSQL specific
    // For now, we filter in application layer if tags are provided

    const memories = await query.orderBy("date", "desc").orderBy("created_at", "desc").execute();

    // Filter by tags in application layer if needed
    if (filters?.tags?.length) {
      return memories.filter((m) => m.tags?.some((t) => filters.tags!.includes(t)));
    }

    return memories;
  }

  /**
   * Get a single memory by ID
   */
  async getById(userId: string, memoryId: string) {
    return db
      .selectFrom("memories")
      .selectAll()
      .where("id", "=", memoryId)
      .where("user_id", "=", userId)
      .executeTakeFirst();
  }

  /**
   * Create a new memory
   */
  async create(data: MemoryInsert) {
    return db.insertInto("memories").values(data).returningAll().executeTakeFirst();
  }

  /**
   * Update a memory
   */
  async update(userId: string, memoryId: string, data: MemoryUpdate) {
    return db
      .updateTable("memories")
      .set(data)
      .where("id", "=", memoryId)
      .where("user_id", "=", userId)
      .returningAll()
      .executeTakeFirst();
  }

  /**
   * Delete a memory and its associated files
   */
  async delete(userId: string, memoryId: string) {
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

    return result.numDeletedRows > 0;
  }

  /**
   * Upload media file for a memory
   */
  async uploadMedia(userId: string, memoryId: string, file: File): Promise<string | null> {
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
      console.error("Failed to upload file:", error);
      return null;
    }

    // Add URL to memory's media_urls
    const currentUrls = memory.media_urls || [];
    await this.update(userId, memoryId, {
      media_urls: [...currentUrls, url],
    });

    return url;
  }

  /**
   * Remove a media file from a memory
   */
  async removeMedia(userId: string, memoryId: string, mediaUrl: string) {
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

    return true;
  }

  /**
   * Toggle favorite status
   */
  async toggleFavorite(userId: string, memoryId: string) {
    const memory = await this.getById(userId, memoryId);

    if (!memory) {
      return null;
    }

    return this.update(userId, memoryId, { is_favorite: !memory.is_favorite });
  }

  /**
   * Get all unique tags used by a user
   */
  async getAllTags(userId: string): Promise<string[]> {
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

    return Array.from(allTags).sort();
  }

  /**
   * Get favorite memories
   */
  async getFavorites(userId: string) {
    return db
      .selectFrom("memories")
      .selectAll()
      .where("user_id", "=", userId)
      .where("is_favorite", "=", true)
      .orderBy("date", "desc")
      .execute();
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

