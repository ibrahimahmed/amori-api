import { Generated, ColumnType } from "kysely";

export interface Memory {
  id: Generated<string>; // UUID
  user_id: string; // FK to users
  person_id: string | null; // FK to people (optional)
  title: string;
  description: string | null;
  date: Date | null; // When the memory occurred
  media_urls: string[] | null; // Array of storage URLs
  tags: string[] | null;
  location: string | null;
  is_favorite: boolean;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string | undefined>;
}

export interface MemoryInsert {
  id?: string;
  user_id: string;
  person_id?: string | null;
  title: string;
  description?: string | null;
  date?: Date | null;
  media_urls?: string[] | null;
  tags?: string[] | null;
  location?: string | null;
  is_favorite?: boolean;
}

export interface MemoryUpdate {
  person_id?: string | null;
  title?: string;
  description?: string | null;
  date?: Date | null;
  media_urls?: string[] | null;
  tags?: string[] | null;
  location?: string | null;
  is_favorite?: boolean;
}

