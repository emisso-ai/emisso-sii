import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { Effect } from "effect";
import type { PGlite } from "@electric-sql/pglite";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { setupTestDb, truncateAll } from "../helpers/setup-db";
import { TEST_TENANT_ID, makeInvoiceRow } from "../helpers/seed";
import { createInvoiceRepo } from "../../src/repos/invoice-repo";

describe("InvoiceRepo", () => {
  let pglite: PGlite;
  let db: PgliteDatabase;
  let repo: ReturnType<typeof createInvoiceRepo>;

  beforeAll(async () => {
    const setup = await setupTestDb();
    pglite = setup.pglite;
    db = setup.db;
    repo = createInvoiceRepo(db as any);
  });

  afterEach(async () => {
    await truncateAll(pglite);
  });

  afterAll(async () => {
    await pglite.close();
  });

  it("upserts invoices and lists them", async () => {
    const row = makeInvoiceRow();
    const count = await Effect.runPromise(repo.upsertMany([row]));
    expect(count).toBe(1);

    const rows = await Effect.runPromise(
      repo.list(TEST_TENANT_ID, {
        periodYear: 2025,
        periodMonth: 3,
        issueType: "received",
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.documentType).toBe("33");
    expect(rows[0]!.number).toBe(1001);
  });

  it("updates on conflict when upserting duplicates", async () => {
    const row = makeInvoiceRow({ totalAmount: "100000" });
    await Effect.runPromise(repo.upsertMany([row]));

    const updated = makeInvoiceRow({ totalAmount: "200000" });
    await Effect.runPromise(repo.upsertMany([updated]));

    const rows = await Effect.runPromise(repo.list(TEST_TENANT_ID));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.totalAmount).toBe("200000");
  });

  it("returns 0 for upsertMany with empty array", async () => {
    const count = await Effect.runPromise(repo.upsertMany([]));
    expect(count).toBe(0);
  });

  it("counts invoices", async () => {
    await Effect.runPromise(
      repo.upsertMany([
        makeInvoiceRow({ number: 1 }),
        makeInvoiceRow({ number: 2 }),
        makeInvoiceRow({ number: 3 }),
      ]),
    );
    const count = await Effect.runPromise(
      repo.count(TEST_TENANT_ID, { periodYear: 2025, periodMonth: 3 }),
    );
    expect(count).toBe(3);
  });

  it("filters by document type", async () => {
    await Effect.runPromise(
      repo.upsertMany([
        makeInvoiceRow({ number: 1, documentType: "33" }),
        makeInvoiceRow({ number: 2, documentType: "34" }),
      ]),
    );
    const rows = await Effect.runPromise(
      repo.list(TEST_TENANT_ID, { documentType: "33" }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.documentType).toBe("33");
  });
});
