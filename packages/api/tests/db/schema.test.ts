import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { setupTestDb, truncateAll } from "../helpers/setup-db";

describe("DB Schema", () => {
  let pglite: PGlite;
  let db: PgliteDatabase;

  beforeAll(async () => {
    const setup = await setupTestDb();
    pglite = setup.pglite;
    db = setup.db;
  });

  afterEach(async () => {
    await truncateAll(pglite);
  });

  afterAll(async () => {
    await pglite.close();
  });

  it("creates sii schema and all tables", async () => {
    const result = await pglite.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'sii' ORDER BY tablename",
    );
    const tables = result.rows.map((r) => r.tablename);
    expect(tables).toEqual(["credentials", "invoices", "sync_jobs", "token_cache"]);
  });

  it("enforces unique constraint on credentials (tenant_id, env)", async () => {
    await pglite.exec(`
      INSERT INTO sii.credentials (tenant_id, env) VALUES ('00000000-0000-0000-0000-000000000001', 'production');
    `);
    await expect(
      pglite.exec(`
        INSERT INTO sii.credentials (tenant_id, env) VALUES ('00000000-0000-0000-0000-000000000001', 'production');
      `),
    ).rejects.toThrow();
  });

  it("cascades token_cache delete when credential is deleted", async () => {
    await pglite.exec(`
      INSERT INTO sii.credentials (id, tenant_id, env)
        VALUES ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000001', 'production');
      INSERT INTO sii.token_cache (credential_id, token_type, token_value, expires_at)
        VALUES ('11111111-1111-1111-1111-111111111111', 'soap', 'tok123', now() + interval '1 hour');
    `);
    await pglite.exec(`DELETE FROM sii.credentials WHERE id = '11111111-1111-1111-1111-111111111111'`);
    const result = await pglite.query("SELECT count(*) as cnt FROM sii.token_cache");
    expect(Number(result.rows[0]?.cnt)).toBe(0);
  });

  it("enforces unique constraint on invoices natural key", async () => {
    const insertSql = `
      INSERT INTO sii.invoices (tenant_id, document_type, number, issuer_rut, receiver_rut, issue_type, tax_period_year, tax_period_month)
      VALUES ('00000000-0000-0000-0000-000000000001', '33', 1001, '76123456-7', '12345678-9', 'received', 2025, 3)
    `;
    await pglite.exec(insertSql);
    await expect(pglite.exec(insertSql)).rejects.toThrow();
  });
});
