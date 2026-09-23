import { SQL } from "bun";

/**
 * The connection pool. With no arguments, Bun reads DATABASE_URL, or the discrete PG*
 * variables when no URL is set; the latter is how the ECS task will supply RDS credentials.
 */
export const sql = new SQL();
