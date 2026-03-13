import { Effect } from "effect";
import { and, eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { tokenCache, type TokenCacheEntry } from "../db/schema/index.js";
import { DbError } from "../core/effect/app-error.js";

export function createTokenCacheRepo(db: PgDatabase<any>) {
  return {
    get(
      credentialId: string,
      tokenType: "soap" | "portal",
    ): Effect.Effect<TokenCacheEntry | null, DbError> {
      return Effect.tryPromise({
        try: () =>
          db
            .select()
            .from(tokenCache)
            .where(
              and(
                eq(tokenCache.credentialId, credentialId),
                eq(tokenCache.tokenType, tokenType),
              ),
            )
            .then((rows) => rows[0] ?? null),
        catch: (e) => DbError.make("tokenCache.get", e),
      });
    },

    upsert(
      credentialId: string,
      tokenType: "soap" | "portal",
      tokenValue: string,
      expiresAt: Date,
    ): Effect.Effect<TokenCacheEntry, DbError> {
      return Effect.tryPromise({
        try: () =>
          db
            .insert(tokenCache)
            .values({ credentialId, tokenType, tokenValue, expiresAt })
            .onConflictDoUpdate({
              target: [tokenCache.credentialId, tokenCache.tokenType],
              set: { tokenValue, expiresAt, createdAt: new Date() },
            })
            .returning()
            .then((rows) => rows[0]!),
        catch: (e) => DbError.make("tokenCache.upsert", e),
      });
    },

    deleteByCredential(credentialId: string): Effect.Effect<void, DbError> {
      return Effect.tryPromise({
        try: () =>
          db
            .delete(tokenCache)
            .where(eq(tokenCache.credentialId, credentialId))
            .then(() => undefined),
        catch: (e) => DbError.make("tokenCache.deleteByCredential", e),
      });
    },
  };
}

export type TokenCacheRepo = ReturnType<typeof createTokenCacheRepo>;
