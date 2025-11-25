import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { env } from "../../config/env";
import type { Database } from "./schema";

const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
});

/**
 * Check database connectivity
 */
export async function checkDatabaseHealth(): Promise<{ healthy: boolean; latency?: number; error?: string }> {
  const start = Date.now();
  try {
    await db.selectFrom("users").select("id").limit(1).execute();
    return { healthy: true, latency: Date.now() - start };
  } catch (e) {
    return {
      healthy: false,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}

/**
 * Close database connection pool
 */
export async function closeDatabaseConnection(): Promise<void> {
  await pool.end();
}
