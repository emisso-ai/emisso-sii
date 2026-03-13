import { Effect } from "effect";
import { and, eq, desc } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { IssueType } from "@emisso/sii";
import { syncJobs, type SyncJob, type NewSyncJob } from "../db/schema/index.js";
import { DbError, NotFoundError } from "../core/effect/app-error.js";
import { queryOneOrFail } from "../core/effect/repo-helpers.js";

export function createSyncJobRepo(db: PgDatabase<any>) {
  return {
    create(
      data: Omit<NewSyncJob, "id" | "createdAt">,
    ): Effect.Effect<SyncJob, DbError> {
      return Effect.tryPromise({
        try: () =>
          db
            .insert(syncJobs)
            .values(data)
            .returning()
            .then((rows) => rows[0]!),
        catch: (e) => DbError.make("syncJob.create", e),
      });
    },

    getById(id: string): Effect.Effect<SyncJob, DbError | NotFoundError> {
      return queryOneOrFail(
        "syncJob.getById",
        "SyncJob",
        id,
        () =>
          db
            .select()
            .from(syncJobs)
            .where(eq(syncJobs.id, id))
            .then((rows) => rows[0]),
      );
    },

    listByTenant(
      tenantId: string,
      filters?: {
        periodYear?: number;
        periodMonth?: number;
        issueType?: IssueType;
      },
    ): Effect.Effect<SyncJob[], DbError> {
      return Effect.tryPromise({
        try: () => {
          const conditions = [eq(syncJobs.tenantId, tenantId)];
          if (filters?.periodYear !== undefined) {
            conditions.push(eq(syncJobs.periodYear, filters.periodYear));
          }
          if (filters?.periodMonth !== undefined) {
            conditions.push(eq(syncJobs.periodMonth, filters.periodMonth));
          }
          if (filters?.issueType) {
            conditions.push(eq(syncJobs.issueType, filters.issueType));
          }
          return db
            .select()
            .from(syncJobs)
            .where(and(...conditions))
            .orderBy(desc(syncJobs.createdAt))
            .limit(20);
        },
        catch: (e) => DbError.make("syncJob.listByTenant", e),
      });
    },

    update(
      id: string,
      data: Partial<Pick<SyncJob, "status" | "startedAt" | "completedAt" | "recordsFetched" | "errorMessage">>,
    ): Effect.Effect<SyncJob, DbError | NotFoundError> {
      return queryOneOrFail(
        "syncJob.update",
        "SyncJob",
        id,
        () =>
          db
            .update(syncJobs)
            .set(data)
            .where(eq(syncJobs.id, id))
            .returning()
            .then((rows) => rows[0]),
      );
    },
  };
}

export type SyncJobRepo = ReturnType<typeof createSyncJobRepo>;
