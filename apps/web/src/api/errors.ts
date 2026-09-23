import { ProblemDetails } from "@iota/shared";

/** A failed API call, carrying the server's problem details. */
export class ApiError extends Error {
  override readonly name = "ApiError";

  constructor(readonly problem: ProblemDetails) {
    super(problem.detail ?? problem.title);
  }

  get status(): number {
    return this.problem.status;
  }
}

type ApiResponse<T> = {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<T>;
};

async function toApiError(res: ApiResponse<unknown>): Promise<ApiError> {
  const body: unknown = await res.json().catch(() => undefined);
  const parsed = ProblemDetails.safeParse(body);
  return new ApiError(
    parsed.success
      ? parsed.data
      : { type: "about:blank", title: res.statusText || "Request failed", status: res.status },
  );
}

/** Resolves to the typed response body, or throws an ApiError for any non-2xx status. */
export async function unwrap<T>(response: Promise<ApiResponse<T>>): Promise<T> {
  const res = await response;
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

/** For responses with no body, such as a 204 from DELETE. */
export async function unwrapEmpty(response: Promise<ApiResponse<unknown>>): Promise<void> {
  const res = await response;
  if (!res.ok) throw await toApiError(res);
}
