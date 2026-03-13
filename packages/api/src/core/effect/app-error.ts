/**
 * Application errors for Effect-based SII API logic.
 * Uses Data.TaggedError which automatically sets `_tag` as the discriminator.
 */

import { Data } from "effect";

// ============================================================================
// ERROR TYPES
// ============================================================================

export class NotFoundError extends Data.TaggedError("NotFoundError")<{
  readonly message: string;
  readonly entity?: string;
  readonly entityId?: string;
}> {
  static make(entity: string, entityId?: string): NotFoundError {
    return new NotFoundError({
      message: `${entity} not found${entityId ? `: ${entityId}` : ""}`,
      entity,
      entityId,
    });
  }
}

export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly message: string;
  readonly field?: string;
  readonly details?: Record<string, unknown>;
  readonly fieldErrors?: Array<{ path: string; message: string }>;
}> {
  static make(
    message: string,
    field?: string,
    details?: Record<string, unknown>,
  ): ValidationError {
    return new ValidationError({
      message,
      field,
      details,
    });
  }

  static fromZodErrors(
    message: string,
    issues: Array<{ path: (string | number)[]; message: string }>,
  ): ValidationError {
    return new ValidationError({
      message,
      fieldErrors: issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
  }
}

export class ForbiddenError extends Data.TaggedError("ForbiddenError")<{
  readonly message: string;
  readonly requiredPermission?: string;
}> {
  static make(
    message: string = "Forbidden",
    requiredPermission?: string,
  ): ForbiddenError {
    return new ForbiddenError({
      message,
      requiredPermission,
    });
  }
}

export class DbError extends Data.TaggedError("DbError")<{
  readonly message: string;
  readonly operation?: string;
  readonly cause?: unknown;
}> {
  static make(operation: string, cause?: unknown): DbError {
    const message =
      cause instanceof Error ? cause.message : "Database operation failed";
    return new DbError({
      message,
      operation,
      cause,
    });
  }
}

export class ConflictError extends Data.TaggedError("ConflictError")<{
  readonly message: string;
  readonly resource?: string;
  readonly conflictingValue?: string;
}> {
  static make(
    message: string,
    resource?: string,
    conflictingValue?: string,
  ): ConflictError {
    return new ConflictError({
      message,
      resource,
      conflictingValue,
    });
  }
}

export class SiiAuthError extends Data.TaggedError("SiiAuthError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {
  static make(message: string, cause?: unknown): SiiAuthError {
    return new SiiAuthError({
      message,
      cause,
    });
  }
}

// ============================================================================
// UNION TYPE
// ============================================================================

export type AppError =
  | NotFoundError
  | ValidationError
  | ForbiddenError
  | DbError
  | ConflictError
  | SiiAuthError;

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isAppError(error: unknown): error is AppError {
  return (
    error instanceof NotFoundError ||
    error instanceof ValidationError ||
    error instanceof ForbiddenError ||
    error instanceof DbError ||
    error instanceof ConflictError ||
    error instanceof SiiAuthError
  );
}

// ============================================================================
// SERIALIZATION
// ============================================================================

export function serializeAppError(error: AppError): {
  _type: string;
  message: string;
  [key: string]: unknown;
} {
  const result: Record<string, unknown> = {
    _type: error._tag,
    message: error.message,
  };

  switch (error._tag) {
    case "NotFoundError":
      if (error.entity) result.entity = error.entity;
      if (error.entityId) result.entityId = error.entityId;
      break;
    case "ValidationError":
      if (error.field) result.field = error.field;
      if (error.details) result.details = error.details;
      if (error.fieldErrors) result.fieldErrors = error.fieldErrors;
      break;
    case "ForbiddenError":
      if (error.requiredPermission)
        result.requiredPermission = error.requiredPermission;
      break;
    case "DbError":
      if (error.operation) result.operation = error.operation;
      break;
    case "ConflictError":
      if (error.resource) result.resource = error.resource;
      if (error.conflictingValue)
        result.conflictingValue = error.conflictingValue;
      break;
    case "SiiAuthError":
      break;
    default: {
      const _exhaustive: never = error;
      return result as any;
    }
  }

  return result as { _type: string; message: string; [key: string]: unknown };
}
