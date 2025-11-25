import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { Client } from "pg";
import "dotenv/config";

const MIGRATIONS_DIR = join(__dirname, "migrations");
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set in your environment");
  process.exit(1);
}

async function runMigrations() {
  console.log("🩷 Amori API - Database Migrations\n");

  // Configure SSL options to handle self-signed certificates (common in cloud DBs)
  const sslConfig = DATABASE_URL.includes("localhost")
    ? false
    : {
        rejectUnauthorized: false,
      };

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: sslConfig,
  });

  try {
    await client.connect();
    console.log("✅ Connected to database\n");

    // Ensure migrations tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Get already applied migrations
    const { rows: appliedRows } = await client.query("SELECT filename FROM _migrations ORDER BY filename");
    const applied = new Set(appliedRows.map((r) => r.filename));

    // Find all .sql files in migrations/
    let files: string[];
    try {
      files = readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith(".sql"))
        .sort();
    } catch (err) {
      console.error("❌ Could not read migrations directory:", MIGRATIONS_DIR);
      console.error("   Make sure the migrations folder exists with .sql files");
      process.exit(1);
    }

    if (files.length === 0) {
      console.log("⚠️  No migration files found in", MIGRATIONS_DIR);
      process.exit(0);
    }

    console.log(`📁 Found ${files.length} migration file(s)\n`);

    let appliedCount = 0;
    let skippedCount = 0;

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`   ✔️  ${file} (already applied)`);
        skippedCount++;
        continue;
      }

      const filePath = join(MIGRATIONS_DIR, file);
      const sql = readFileSync(filePath, "utf8");

      process.stdout.write(`   ⏳ ${file} ... `);

      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO _migrations (filename) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log("✅ done");
        appliedCount++;
      } catch (err: any) {
        await client.query("ROLLBACK");
        console.log("❌ failed");
        console.error(`\n❌ Error applying ${file}:`);
        console.error(`   ${err.message || err}`);
        process.exit(1);
      }
    }

    console.log("");
    if (appliedCount > 0) {
      console.log(`✅ Applied ${appliedCount} migration(s)`);
    }
    if (skippedCount > 0) {
      console.log(`⏭️  Skipped ${skippedCount} already applied migration(s)`);
    }
    if (appliedCount === 0 && skippedCount === files.length) {
      console.log("✅ Database is up to date!");
    }
  } catch (err: any) {
    console.error("❌ Database connection failed:");
    console.error(`   ${err.message || err}`);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Run migrations
runMigrations();

