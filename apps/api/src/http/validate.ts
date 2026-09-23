import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { z } from "zod";

type Issue = { path: PropertyKey[]; message: string };

export class ValidationFailed extends Error {
  override readonly name = "ValidationFailed";

  constructor(readonly issues: readonly Issue[]) {
    super("Request validation failed");
  }
}

export const validate = <Target extends keyof ValidationTargets, Schema extends z.ZodType>(
  target: Target,
  schema: Schema,
) =>
  zValidator(target, schema, (result) => {
    if (!result.success) throw new ValidationFailed(result.error.issues);
  });
