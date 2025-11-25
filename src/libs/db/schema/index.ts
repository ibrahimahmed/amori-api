import { User } from "./user.model";
import { Session } from "./session.model";

export interface Schema {
    user: User;
    sessions: Session;
  }
  