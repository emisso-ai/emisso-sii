import { Effect } from "effect";
import { and, eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { SiiEnv } from "@emisso/sii";
import { credentials, type Credential, type NewCredential } from "../db/schema/index.js";
import { DbError, NotFoundError } from "../core/effect/app-error.js";

export function createCredentialRepo(db: PgDatabase<any>) {
  return {
    getByTenantAndEnv(
      tenantId: string,
      env: SiiEnv,
    ): Effect.Effect<Credential, DbError | NotFoundError> {
      return Effect.tryPromise({
        try: () =>
          db
            .select()
            .from(credentials)
            .where(
              and(
                eq(credentials.tenantId, tenantId),
                eq(credentials.env, env),
              ),
            )
            .then((rows) => rows[0]),
        catch: (e) => DbError.make("credential.getByTenantAndEnv", e),
      }).pipe(
        Effect.flatMap((row) =>
          row
            ? Effect.succeed(row)
            : Effect.fail(NotFoundError.make("Credential", `${tenantId}/${env}`)),
        ),
      );
    },

    upsert(
      tenantId: string,
      data: Omit<NewCredential, "id" | "tenantId" | "createdAt" | "updatedAt">,
    ): Effect.Effect<Credential, DbError> {
      return Effect.tryPromise({
        try: () =>
          db
            .insert(credentials)
            .values({ ...data, tenantId })
            .onConflictDoUpdate({
              target: [credentials.tenantId, credentials.env],
              set: { ...data, updatedAt: new Date() },
            })
            .returning()
            .then((rows) => rows[0]!),
        catch: (e) => DbError.make("credential.upsert", e),
      });
    },

    delete(
      tenantId: string,
      env: SiiEnv,
    ): Effect.Effect<boolean, DbError> {
      return Effect.tryPromise({
        try: () =>
          db
            .delete(credentials)
            .where(
              and(
                eq(credentials.tenantId, tenantId),
                eq(credentials.env, env),
              ),
            )
            .returning()
            .then((rows) => rows.length > 0),
        catch: (e) => DbError.make("credential.delete", e),
      });
    },
  };
}

export type CredentialRepo = ReturnType<typeof createCredentialRepo>;
