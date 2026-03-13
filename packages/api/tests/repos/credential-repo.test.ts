import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { Effect } from "effect";
import type { PGlite } from "@electric-sql/pglite";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { setupTestDb, truncateAll } from "../helpers/setup-db";
import { TEST_TENANT_ID } from "../helpers/seed";
import { createCredentialRepo } from "../../src/repos/credential-repo";

describe("CredentialRepo", () => {
  let pglite: PGlite;
  let db: PgliteDatabase;
  let repo: ReturnType<typeof createCredentialRepo>;

  beforeAll(async () => {
    const setup = await setupTestDb();
    pglite = setup.pglite;
    db = setup.db;
    repo = createCredentialRepo(db as any);
  });

  afterEach(async () => {
    await truncateAll(pglite);
  });

  afterAll(async () => {
    await pglite.close();
  });

  it("upserts and retrieves credentials", async () => {
    const created = await Effect.runPromise(
      repo.upsert(TEST_TENANT_ID, {
        env: "production",
        certBase64: "dGVzdA==",
        certPassword: "pass",
        portalRut: "76123456-7",
        portalPassword: "pass123",
      }),
    );

    expect(created.tenantId).toBe(TEST_TENANT_ID);
    expect(created.env).toBe("production");
    expect(created.certBase64).toBe("dGVzdA==");

    const fetched = await Effect.runPromise(
      repo.getByTenantAndEnv(TEST_TENANT_ID, "production"),
    );
    expect(fetched.id).toBe(created.id);
  });

  it("updates on conflict (upsert)", async () => {
    await Effect.runPromise(
      repo.upsert(TEST_TENANT_ID, {
        env: "production",
        certBase64: "old",
        certPassword: "old",
      }),
    );

    const updated = await Effect.runPromise(
      repo.upsert(TEST_TENANT_ID, {
        env: "production",
        certBase64: "new",
        certPassword: "new",
      }),
    );

    expect(updated.certBase64).toBe("new");
  });

  it("returns NotFoundError for missing credentials", async () => {
    const result = await Effect.runPromiseExit(
      repo.getByTenantAndEnv(TEST_TENANT_ID, "production"),
    );
    expect(result._tag).toBe("Failure");
  });

  it("deletes credentials", async () => {
    await Effect.runPromise(
      repo.upsert(TEST_TENANT_ID, { env: "production" }),
    );

    const deleted = await Effect.runPromise(
      repo.delete(TEST_TENANT_ID, "production"),
    );
    expect(deleted).toBe(true);

    const deletedAgain = await Effect.runPromise(
      repo.delete(TEST_TENANT_ID, "production"),
    );
    expect(deletedAgain).toBe(false);
  });
});
