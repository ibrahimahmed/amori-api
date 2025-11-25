import { Generated, ColumnType } from "kysely";

export type EventType =
  | "birthday"
  | "anniversary"
  | "date"
  | "meeting"
  | "call"
  | "gift"
  | "trip"
  | "other";

export interface PlannerEvent {
  id: Generated<string>; // UUID
  user_id: string; // FK to users
  person_id: string | null; // FK to people
  event_type: EventType;
  title: string;
  description: string | null;
  date: Date; // Event date
  reminder_at: Date | null; // When to send reminder
  location: string | null;
  notes: string | null;
  completed: boolean;
  completed_at: Date | null;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string | undefined>;
}

export interface PlannerEventInsert {
  id?: string;
  user_id: string;
  person_id?: string | null;
  event_type: EventType;
  title: string;
  description?: string | null;
  date: Date;
  reminder_at?: Date | null;
  location?: string | null;
  notes?: string | null;
  completed?: boolean;
}

export interface PlannerEventUpdate {
  person_id?: string | null;
  event_type?: EventType;
  title?: string;
  description?: string | null;
  date?: Date;
  reminder_at?: Date | null;
  location?: string | null;
  notes?: string | null;
  completed?: boolean;
  completed_at?: Date | null;
}

