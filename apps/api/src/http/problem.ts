import type { ProblemDetails } from "@iota/shared";
import { HTTPException } from "hono/http-exception";
import { DeviceNotFound, TypeMismatch, UnsupportedAction } from "../errors";
import { ValidationFailed } from "./validate";

export const problemResponse = (problem: ProblemDetails): Response =>
  new Response(JSON.stringify(problem), {
    status: problem.status,
    headers: { "Content-Type": "application/problem+json" },
  });

export function toProblem(error: unknown): ProblemDetails {
  if (error instanceof ValidationFailed) {
    return {
      type: "urn:iota:problem:validation",
      title: "Invalid request",
      status: 400,
      errors: error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        message: issue.message,
      })),
    };
  }
  if (error instanceof DeviceNotFound) {
    return {
      type: "urn:iota:problem:device-not-found",
      title: "Device not found",
      status: 404,
      detail: error.message,
    };
  }
  if (error instanceof TypeMismatch) {
    return {
      type: "urn:iota:problem:type-mismatch",
      title: "Device type mismatch",
      status: 409,
      detail: error.message,
    };
  }
  if (error instanceof UnsupportedAction) {
    return {
      type: "urn:iota:problem:unsupported-action",
      title: "Unsupported action",
      status: 422,
      detail: error.message,
    };
  }
  // Raised by Hono itself, for example for a malformed JSON body.
  if (error instanceof HTTPException) {
    return { type: "about:blank", title: error.message || "Request failed", status: error.status };
  }

  console.error(error);
  return { type: "about:blank", title: "Internal server error", status: 500 };
}
