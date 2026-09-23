import { z } from "zod";

const Env = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    // Read by Bun's SQL client directly; validated here only so a missing value fails at startup.
    DATABASE_URL: z.string().min(1).optional(),
    PGHOST: z.string().min(1).optional(),
  })
  .refine((env) => env.DATABASE_URL !== undefined || env.PGHOST !== undefined, {
    message: "Set DATABASE_URL, or PGHOST with the other PG* variables",
  });

/** Validated once at startup; an invalid environment stops the process before it serves anything. */
export const config = Env.parse(process.env);
