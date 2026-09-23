import type { AppType } from "@iota/api";
import { hc } from "hono/client";

/**
 * Typed client for the iota API. Paths, request bodies and response types all come from the
 * server's route definitions; nothing here is written by hand.
 */
export const api = hc<AppType>(window.location.origin).api;
