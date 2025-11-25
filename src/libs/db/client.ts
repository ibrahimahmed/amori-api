// src/db/client.ts
import "dotenv/config";
import { env } from "../../config/env";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { Schema } from "./schema";

if (!env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set in your environment");
}

const pool = new Pool({ connectionString: env.DATABASE_URL });
export const db = new Kysely<Schema>({
  dialect: new PostgresDialect({ pool }),
});

export const checkDatabaseHealth = async () => {
  try {
    await db.selectFrom("user").select("id").limit(1).execute();
    return { healthy: true, latency: 0 };
  } catch (e) {
    return { healthy: false, error: e };
  }
};

export const closeDatabaseConnection = async () => {
  await pool.end();
};
