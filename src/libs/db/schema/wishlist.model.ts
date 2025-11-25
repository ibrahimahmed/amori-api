import { Generated, ColumnType } from "kysely";

export type Priority = "low" | "medium" | "high";

export interface WishlistItem {
  id: Generated<string>; // UUID
  user_id: string; // FK to users
  person_id: string | null; // FK to people (gift for whom)
  title: string;
  description: string | null;
  price_range: string | null; // e.g., "$50-100"
  url: string | null; // Link to product
  image_url: string | null;
  priority: Priority;
  purchased: boolean;
  purchased_at: Date | null;
  notes: string | null;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string | undefined>;
}

export interface WishlistItemInsert {
  id?: string;
  user_id: string;
  person_id?: string | null;
  title: string;
  description?: string | null;
  price_range?: string | null;
  url?: string | null;
  image_url?: string | null;
  priority?: Priority;
  purchased?: boolean;
  notes?: string | null;
}

export interface WishlistItemUpdate {
  person_id?: string | null;
  title?: string;
  description?: string | null;
  price_range?: string | null;
  url?: string | null;
  image_url?: string | null;
  priority?: Priority;
  purchased?: boolean;
  purchased_at?: Date | null;
  notes?: string | null;
}

