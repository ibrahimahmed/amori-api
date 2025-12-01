import { User } from "./user.model";
import { Person } from "./people.model";
import { Memory } from "./memories.model";
import { WishlistItem } from "./wishlist.model";
import { PlannerEvent } from "./planner.model";
import { Feedback } from "./feedback.model";

export interface Database {
  users: User;
  people: Person;
  memories: Memory;
  wishlist: WishlistItem;
  planner: PlannerEvent;
  feedback: Feedback;
}

// Re-export all types
export * from "./user.model";
export * from "./people.model";
export * from "./memories.model";
export * from "./wishlist.model";
export * from "./planner.model";
export * from "./feedback.model";
