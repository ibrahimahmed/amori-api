import { db } from "../../libs/db/client";
import { sql } from "kysely";
import type { Selectable } from "kysely";
import type { PersonInsert, PersonUpdate, RelationType, Memory, PlannerEvent, WishlistItem } from "../../libs/db/schema";

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
   * Get all people for a user
   */
  async getAll(userId: string, filters?: { relationType?: RelationType }) {
    let query = db.selectFrom("people").selectAll().where("user_id", "=", userId);

    if (filters?.relationType) {
      query = query.where("relation_type", "=", filters.relationType);
    }

    return query.orderBy("name", "asc").execute();
  }

  /**
   * Get a single person by ID
   */
  async getById(userId: string, personId: string) {
    return db
      .selectFrom("people")
      .selectAll()
      .where("id", "=", personId)
      .where("user_id", "=", userId)
      .executeTakeFirst();
  }

  /**
   * Create a new person
   */
  async create(data: PersonInsert) {
    return db.insertInto("people").values(data).returningAll().executeTakeFirst();
  }

  /**
   * Update a person
   */
  async update(userId: string, personId: string, data: PersonUpdate) {
    return db
      .updateTable("people")
      .set(data)
      .where("id", "=", personId)
      .where("user_id", "=", userId)
      .returningAll()
      .executeTakeFirst();
  }

  /**
   * Delete a person and all associated data (memories, plans, wishlist)
   * Uses single query with CTEs for optimal performance
   */
  async delete(userId: string, personId: string) {
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
    return result.rows.length > 0 && result.rows[0].deleted_id !== null;
  }

  /**
   * Get upcoming events: birthdays, anniversaries, memory anniversaries, and upcoming plans
   * Uses single query with JSON aggregation for optimal performance
   */
  async getUpcomingEvents(userId: string, daysAhead: number = 30): Promise<UpcomingEvents> {
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
    return {
      birthdays: birthdays.sort(sortByDays),
      anniversaries: anniversaries.sort(sortByDays),
      upcomingMemories: upcomingMemories.sort(sortByDays),
      upcomingPlans,
    };
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
   * Get full profile of a person including memories, upcoming plans, and wishlist
   * Uses single query with JSON aggregation for optimal performance
   */
  async getFullProfile(userId: string, personId: string): Promise<PersonProfile | null> {
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
    return {
      person,
      memories: data.memories,
      upcomingPlans: data.upcoming_plans,
      wishlist: data.wishlist,
      daysUntilBirthday,
      daysUntilAnniversary,
    };
  }
}

export const peopleService = new PeopleService();

