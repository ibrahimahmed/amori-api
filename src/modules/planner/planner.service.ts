import { db } from "../../libs/db/client";
import type { PlannerEventInsert, PlannerEventUpdate, EventType } from "../../libs/db/schema";

export interface PlannerFilters {
  personId?: string;
  eventType?: EventType;
  startDate?: Date;
  endDate?: Date;
  completed?: boolean;
}

export class PlannerService {
  /**
   * Get all events for a user
   */
  async getAll(userId: string, filters?: PlannerFilters) {
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

    return query.orderBy("date", "asc").execute();
  }

  /**
   * Get a single event by ID
   */
  async getById(userId: string, eventId: string) {
    return db
      .selectFrom("planner")
      .selectAll()
      .where("id", "=", eventId)
      .where("user_id", "=", userId)
      .executeTakeFirst();
  }

  /**
   * Create a new event
   */
  async create(data: PlannerEventInsert) {
    return db.insertInto("planner").values(data).returningAll().executeTakeFirst();
  }

  /**
   * Update an event
   */
  async update(userId: string, eventId: string, data: PlannerEventUpdate) {
    return db
      .updateTable("planner")
      .set(data)
      .where("id", "=", eventId)
      .where("user_id", "=", userId)
      .returningAll()
      .executeTakeFirst();
  }

  /**
   * Delete an event
   */
  async delete(userId: string, eventId: string) {
    const result = await db
      .deleteFrom("planner")
      .where("id", "=", eventId)
      .where("user_id", "=", userId)
      .executeTakeFirst();

    return result.numDeletedRows > 0;
  }

  /**
   * Mark event as completed
   */
  async markCompleted(userId: string, eventId: string, completed: boolean = true) {
    return db
      .updateTable("planner")
      .set({
        completed,
        completed_at: completed ? new Date() : null,
      })
      .where("id", "=", eventId)
      .where("user_id", "=", userId)
      .returningAll()
      .executeTakeFirst();
  }

  /**
   * Get upcoming events
   */
  async getUpcoming(userId: string, daysAhead: number = 7) {
    const now = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + daysAhead);

    return db
      .selectFrom("planner")
      .selectAll()
      .where("user_id", "=", userId)
      .where("date", ">=", now)
      .where("date", "<=", endDate)
      .where("completed", "=", false)
      .orderBy("date", "asc")
      .execute();
  }

  /**
   * Get overdue events
   */
  async getOverdue(userId: string) {
    const now = new Date();

    return db
      .selectFrom("planner")
      .selectAll()
      .where("user_id", "=", userId)
      .where("date", "<", now)
      .where("completed", "=", false)
      .orderBy("date", "asc")
      .execute();
  }

  /**
   * Get events for a specific date
   */
  async getByDate(userId: string, date: Date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return db
      .selectFrom("planner")
      .selectAll()
      .where("user_id", "=", userId)
      .where("date", ">=", startOfDay)
      .where("date", "<=", endOfDay)
      .orderBy("date", "asc")
      .execute();
  }

  /**
   * Get events for a month (calendar view)
   */
  async getByMonth(userId: string, year: number, month: number) {
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

    return db
      .selectFrom("planner")
      .selectAll()
      .where("user_id", "=", userId)
      .where("date", ">=", startOfMonth)
      .where("date", "<=", endOfMonth)
      .orderBy("date", "asc")
      .execute();
  }

  /**
   * Get events that need reminders sent
   */
  async getEventsNeedingReminders() {
    const now = new Date();
    const buffer = new Date(now.getTime() + 5 * 60 * 1000); // 5 minute buffer

    return db
      .selectFrom("planner")
      .selectAll()
      .where("reminder_at", "<=", buffer)
      .where("reminder_at", ">=", now)
      .where("completed", "=", false)
      .execute();
  }

  /**
   * Get statistics for a user
   */
  async getStats(userId: string) {
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
  }
}

export const plannerService = new PlannerService();

