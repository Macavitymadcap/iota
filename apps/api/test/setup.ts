import { afterAll, beforeEach } from "bun:test";

// Must be set before db.ts is first imported, which is why the imports below are dynamic.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://iota:iota@localhost:5432/iota_test";

if (!new URL(process.env.DATABASE_URL).pathname.endsWith("_test")) {
  throw new Error(`Refusing to run tests against ${process.env.DATABASE_URL}`);
}

const { sql } = await import("../src/db");
const { migrate } = await import("../scripts/migrate");

await migrate();

beforeEach(async () => {
  await sql`TRUNCATE devices CASCADE`;
});

afterAll(async () => {
  await sql.close();
});