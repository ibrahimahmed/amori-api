import { Generated, ColumnType } from "kysely";

export type RelationType =
  | "partner"
  | "spouse"
  | "parent"
  | "child"
  | "sibling"
  | "friend"
  | "colleague"
  | "mentor"
  | "other";

export interface Person {
  id: Generated<string>; // UUID
  user_id: string; // FK to users
  name: string;
  relation_type: RelationType;
  birthday: Date | null;
  anniversary: Date | null;
  notes: string[] | null; // Array of notes for AI context
  avatar_url: string | null;
  phone: string | null;
  email: string | null;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string | undefined>;
}

export interface PersonInsert {
  id?: string;
  user_id: string;
  name: string;
  relation_type: RelationType;
  birthday?: Date | null;
  anniversary?: Date | null;
  notes?: string[] | null;
  avatar_url?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface PersonUpdate {
  name?: string;
  relation_type?: RelationType;
  birthday?: Date | null;
  anniversary?: Date | null;
  notes?: string[] | null;
  avatar_url?: string | null;
  phone?: string | null;
  email?: string | null;
}

