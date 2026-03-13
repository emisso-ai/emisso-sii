import { Effect } from "effect";
import { DbError, NotFoundError } from "./app-error.js";

/**
 * Query a single row and fail with NotFoundError if not found.
 */
export function queryOneOrFail<T>(
  operation: string,
  entity: string,
  entityId: string,
  query: () => Promise<T | undefined>,
): Effect.Effect<T, DbError | NotFoundError> {
  return Effect.tryPromise({
    try: query,
    catch: (e) => DbError.make(operation, e),
  }).pipe(
    Effect.flatMap((row) =>
      row
        ? Effect.succeed(row)
        : Effect.fail(NotFoundError.make(entity, entityId)),
    ),
  );
}
