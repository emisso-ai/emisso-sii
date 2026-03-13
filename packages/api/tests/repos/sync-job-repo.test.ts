import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { Effect } from "effect";
import type { PGlite } from "@electric-sql/pglite";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { setupTestDb, truncateAll } from "../helpers/setup-db";
import { TEST_TENANT_ID, makeSyncJob } from "../helpers/seed";
import { createSyncJobRepo } from "../../src/repos/sync-job-repo";

describe("SyncJobRepo", () => {
  let pglite: PGlite;
  let db: PgliteDatabase;
  let repo: ReturnType<typeof createSyncJobRepo>;

  beforeAll(async () => {
    const setup = await setupTestDb();
    pglite = setup.pglite;
    db = setup.db;
    repo = createSyncJobRepo(db as any);
  });

  afterEach(async () => {
    await truncateAll(pglite);
  });

  afterAll(async () => {
    await pglite.close();
  });

  it("creates and retrieves a sync job", async () => {
    const job = await Effect.runPromise(repo.create(makeSyncJob()));
    expect(job.tenantId).toBe(TEST_TENANT_ID);
    expect(job.status).toBe("pending");

    const fetched = await Effect.runPromise(repo.getById(job.id));
    expect(fetched.id).toBe(job.id);
  });

  it("updates a sync job", async () => {
    const job = await Effect.runPromise(repo.create(makeSyncJob()));

    const updated = await Effect.runPromise(
      repo.update(job.id, {
        status: "completed",
        completedAt: new Date(),
        recordsFetched: 42,
      }),
    );
    expect(updated.status).toBe("completed");
    expect(updated.recordsFetched).toBe(42);
  });

  it("lists sync jobs by tenant with filters", async () => {
    await Effect.runPromise(repo.create(makeSyncJob({ periodMonth: 3 })));
    await Effect.runPromise(repo.create(makeSyncJob({ periodMonth: 4 })));

    const all = await Effect.runPromise(repo.listByTenant(TEST_TENANT_ID));
    expect(all).toHaveLength(2);

    const filtered = await Effect.runPromise(
      repo.listByTenant(TEST_TENANT_ID, { periodMonth: 3 }),
    );
    expect(filtered).toHaveLength(1);
  });

  it("returns NotFoundError for missing job", async () => {
    const result = await Effect.runPromiseExit(
      repo.getById("00000000-0000-0000-0000-000000000099"),
    );
    expect(result._tag).toBe("Failure");
  });
});
