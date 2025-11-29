import { db } from "../../libs/db/client";
import type { WishlistItemInsert, WishlistItemUpdate, Priority } from "../../libs/db/schema";
import { logger } from "../../libs/logger";

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
   * Get all wishlist items for a user
   */
  async getAll(userId: string, filters?: WishlistFilters) {
    try {
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

      return await query.orderBy("priority", "desc").orderBy("created_at", "desc").execute();
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
      return await db.insertInto("wishlist").values(data as any).returningAll().executeTakeFirst();
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
      return await db
        .updateTable("wishlist")
        .set(data)
        .where("id", "=", itemId)
        .where("user_id", "=", userId)
        .returningAll()
        .executeTakeFirst();
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

      return result.numDeletedRows > 0;
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
      return await db
        .updateTable("wishlist")
        .set({
          purchased,
          purchased_at: purchased ? new Date() : null,
        })
        .where("id", "=", itemId)
        .where("user_id", "=", userId)
        .returningAll()
        .executeTakeFirst();
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
      return await db
        .selectFrom("wishlist")
        .selectAll()
        .where("user_id", "=", userId)
        .where("purchased", "=", true)
        .orderBy("purchased_at", "desc")
        .execute();
    } catch (error) {
      logger.error("Failed to get purchase history", error as Error, { userId });
      throw new ServiceError("Failed to retrieve history", "DATABASE", 500);
    }
  }
}

export const wishlistService = new WishlistService();

