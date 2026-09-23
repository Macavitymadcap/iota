import { z } from "zod";

/** RFC 9457 problem details, as returned by every API error. */
export const ProblemDetails = z.object({
  type: z.string(),
  title: z.string(),
  status: z.int(),
  detail: z.string().optional(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});

export type ProblemDetails = z.infer<typeof ProblemDetails>;
