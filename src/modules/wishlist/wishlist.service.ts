import { db } from "../../libs/db/client";
import type { WishlistItemInsert, WishlistItemUpdate, Priority } from "../../libs/db/schema";

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

    return query.orderBy("priority", "desc").orderBy("created_at", "desc").execute();
  }

  /**
   * Get a single wishlist item by ID
   */
  async getById(userId: string, itemId: string) {
    return db
      .selectFrom("wishlist")
      .selectAll()
      .where("id", "=", itemId)
      .where("user_id", "=", userId)
      .executeTakeFirst();
  }

  /**
   * Create a new wishlist item
   */
  async create(data: WishlistItemInsert) {
    return db.insertInto("wishlist").values(data).returningAll().executeTakeFirst();
  }

  /**
   * Update a wishlist item
   */
  async update(userId: string, itemId: string, data: WishlistItemUpdate) {
    return db
      .updateTable("wishlist")
      .set(data)
      .where("id", "=", itemId)
      .where("user_id", "=", userId)
      .returningAll()
      .executeTakeFirst();
  }

  /**
   * Delete a wishlist item
   */
  async delete(userId: string, itemId: string) {
    const result = await db
      .deleteFrom("wishlist")
      .where("id", "=", itemId)
      .where("user_id", "=", userId)
      .executeTakeFirst();

    return result.numDeletedRows > 0;
  }

  /**
   * Mark item as purchased
   */
  async markPurchased(userId: string, itemId: string, purchased: boolean = true) {
    return db
      .updateTable("wishlist")
      .set({
        purchased,
        purchased_at: purchased ? new Date() : null,
      })
      .where("id", "=", itemId)
      .where("user_id", "=", userId)
      .returningAll()
      .executeTakeFirst();
  }

  /**
   * Get items grouped by person
   */
  async getGroupedByPerson(userId: string) {
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
  }

  /**
   * Get unpurchased items for a person
   */
  async getUnpurchasedForPerson(userId: string, personId: string) {
    return db
      .selectFrom("wishlist")
      .selectAll()
      .where("user_id", "=", userId)
      .where("person_id", "=", personId)
      .where("purchased", "=", false)
      .orderBy("priority", "desc")
      .execute();
  }

  /**
   * Get purchase history
   */
  async getPurchaseHistory(userId: string) {
    return db
      .selectFrom("wishlist")
      .selectAll()
      .where("user_id", "=", userId)
      .where("purchased", "=", true)
      .orderBy("purchased_at", "desc")
      .execute();
  }
}

export const wishlistService = new WishlistService();

