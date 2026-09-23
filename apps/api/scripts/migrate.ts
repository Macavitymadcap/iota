import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "../src/db";

const MIGRATIONS_DIR = join(import.meta.dir, "..", "migrations");

/**
 * Applies any migrations not yet recorded, in filename order. Each file and its record are
 * written in one transaction, so a failed migration leaves no trace and can be fixed and rerun.
 */
export async function migrate(): Promise<string[]> {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    text        PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  const rows: { version: string }[] = await sql`SELECT version FROM schema_migrations`;
  const applied = new Set(rows.map((row) => row.version));

  const files = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith(".sql")).sort();
  const ran: string[] = [];

  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    if (applied.has(version)) continue;

    const text = await Bun.file(join(MIGRATIONS_DIR, file)).text();
    await sql.begin(async (tx) => {
      // Our own trusted files; unsafe() without parameters allows multiple statements.
      await tx.unsafe(text);
      await tx`INSERT INTO schema_migrations (version) VALUES (${version})`;
    });
    ran.push(version);
  }

  return ran;
}

if (import.meta.main) {
  const ran = await migrate();
  console.log(ran.length > 0 ? `Applied: ${ran.join(", ")}` : "Already up to date");
  await sql.close();
}
