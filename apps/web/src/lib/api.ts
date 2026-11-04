import { errorEnvelopeSchema, successEnvelopeSchema } from "@pact/shared";
import type { z } from "zod";

const baseUrl = process.env.NEXT_PUBLIC_PACT_API_URL?.replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  if (!baseUrl) {
    throw new ApiError(
      "API URL is not configured. Set NEXT_PUBLIC_PACT_API_URL to the backend origin.",
      0,
    );
  }
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    throw new ApiError("PACT API could not be reached.", 0);
  }
  const body: unknown = await response.json().catch(() => undefined);
  const failure = errorEnvelopeSchema.safeParse(body);
  if (!response.ok || failure.success) {
    if (failure.success) {
      throw new ApiError(
        failure.data.message,
        response.status,
        failure.data.error.code,
        failure.data.meta.requestId,
      );
    }
    throw new ApiError(
      `The API returned HTTP ${response.status}.`,
      response.status,
    );
  }
  const success = successEnvelopeSchema(schema).safeParse(body);
  if (!success.success) {
    throw new ApiError(
      "The API response did not match the expected contract.",
      response.status,
    );
  }
  return success.data.data;
}

export function apiErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError))
    return "The request could not be completed.";
  if (error.status === 401)
    return "Your session is missing or expired. The backend currently has no user sign-in/session bootstrap route.";
  if (error.status === 403)
    return "This session is not authorized for the selected organization.";
  return (
    error.message + (error.requestId ? ` Request ID: ${error.requestId}` : "")
  );
}
