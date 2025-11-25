import { Generated, ColumnType } from "kysely";

export interface User {
  id: string; // UUID from Supabase Auth
  email: string;
  name: string | null;
  avatar_url: string | null;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string | undefined>;
}

export interface UserInsert {
  id: string;
  email: string;
  name?: string | null;
  avatar_url?: string | null;
}

export interface UserUpdate {
  name?: string | null;
  avatar_url?: string | null;
}
