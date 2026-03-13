/**
 * Framework-agnostic HTTP response helpers using Web API Response.
 * No dependency on Next.js or any framework.
 */

import type { AppError } from "./app-error.js";
import { isAppError, serializeAppError } from "./app-error.js";

// ============================================================================
// STATUS CODE MAPPING
// ============================================================================

const STATUS_MAP: Record<AppError["_type"], number> = {
  ValidationError: 400,
  ForbiddenError: 403,
  NotFoundError: 404,
  ConflictError: 409,
  SiiAuthError: 502,
  DbError: 500,
};

// ============================================================================
// ERROR RESPONSES
// ============================================================================

export function toErrorResponse(error: AppError): Response {
  const status = STATUS_MAP[error._type] ?? 500;
  const body = serializeAppError(error);
  return Response.json({ error: body }, { status });
}

/**
 * Extracts an AppError from an unknown error, handling Effect's FiberFailure wrapping.
 */
function extractAppError(error: unknown): AppError | null {
  if (isAppError(error)) return error;
  const cause = (error as any)?.cause ?? (error as any)?.[Symbol.for("effect/Runtime/FiberFailure/Cause")];
  if (cause) {
    const inner = cause?.error ?? (cause?._tag === "Fail" ? cause?.error : undefined);
    if (isAppError(inner)) return inner;
  }
  return null;
}

export function toErrorResponseFromUnknown(error: unknown): Response {
  const appError = extractAppError(error);
  if (appError) return toErrorResponse(appError);
  console.error("[sii-api] Unhandled error:", error);
  return Response.json(
    { error: { _type: "InternalError", message: "Internal server error" } },
    { status: 500 },
  );
}

// ============================================================================
// SUCCESS RESPONSES
// ============================================================================

export function jsonResponse<T>(data: T, status: number = 200): Response {
  return Response.json(data, { status });
}

export function createdResponse<T>(data: T): Response {
  return Response.json(data, { status: 201 });
}

export function noContentResponse(): Response {
  return new Response(null, { status: 204 });
}
