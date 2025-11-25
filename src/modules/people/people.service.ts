import { db } from "../../libs/db/client";
import type { PersonInsert, PersonUpdate, RelationType } from "../../libs/db/schema";

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
   * Delete a person
   */
  async delete(userId: string, personId: string) {
    const result = await db
      .deleteFrom("people")
      .where("id", "=", personId)
      .where("user_id", "=", userId)
      .executeTakeFirst();

    return result.numDeletedRows > 0;
  }

  /**
   * Get upcoming birthdays
   */
  async getUpcomingBirthdays(userId: string, daysAhead: number = 30) {
    // Get all people with birthdays and filter in application
    const people = await db
      .selectFrom("people")
      .selectAll()
      .where("user_id", "=", userId)
      .where("birthday", "is not", null)
      .execute();

    const today = new Date();
    const upcoming: Array<{ person: (typeof people)[0]; daysUntil: number }> = [];

    for (const person of people) {
      if (!person.birthday) continue;

      const birthday = new Date(person.birthday);
      const thisYearBirthday = new Date(today.getFullYear(), birthday.getMonth(), birthday.getDate());

      // If birthday has passed this year, check next year
      if (thisYearBirthday < today) {
        thisYearBirthday.setFullYear(thisYearBirthday.getFullYear() + 1);
      }

      const daysUntil = Math.ceil((thisYearBirthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntil <= daysAhead) {
        upcoming.push({ person, daysUntil });
      }
    }

    return upcoming.sort((a, b) => a.daysUntil - b.daysUntil);
  }

  /**
   * Get upcoming anniversaries
   */
  async getUpcomingAnniversaries(userId: string, daysAhead: number = 30) {
    const people = await db
      .selectFrom("people")
      .selectAll()
      .where("user_id", "=", userId)
      .where("anniversary", "is not", null)
      .execute();

    const today = new Date();
    const upcoming: Array<{ person: (typeof people)[0]; daysUntil: number; years: number }> = [];

    for (const person of people) {
      if (!person.anniversary) continue;

      const anniversary = new Date(person.anniversary);
      const thisYearAnniversary = new Date(today.getFullYear(), anniversary.getMonth(), anniversary.getDate());

      if (thisYearAnniversary < today) {
        thisYearAnniversary.setFullYear(thisYearAnniversary.getFullYear() + 1);
      }

      const daysUntil = Math.ceil((thisYearAnniversary.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const years = thisYearAnniversary.getFullYear() - anniversary.getFullYear();

      if (daysUntil <= daysAhead) {
        upcoming.push({ person, daysUntil, years });
      }
    }

    return upcoming.sort((a, b) => a.daysUntil - b.daysUntil);
  }
}

export const peopleService = new PeopleService();

