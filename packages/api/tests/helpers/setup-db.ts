/**
 * PGLite test helper — creates an in-memory PostgreSQL instance
 * with the SII schema applied via raw SQL DDL.
 */

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { PgliteDatabase } from "drizzle-orm/pglite";

/**
 * Creates a PGLite instance and applies the SII schema.
 * Returns the raw PGLite instance and the Drizzle DB wrapper.
 */
export async function setupTestDb(): Promise<{
  pglite: PGlite;
  db: PgliteDatabase;
}> {
  const pglite = new PGlite();
  const db = drizzle(pglite);

  await pglite.exec(SCHEMA_SQL);

  return { pglite, db };
}

/**
 * Truncates all tables in the sii schema (for afterEach cleanup).
 */
export async function truncateAll(pglite: PGlite): Promise<void> {
  await pglite.exec(`
    TRUNCATE TABLE
      sii.sync_jobs,
      sii.invoices,
      sii.token_cache,
      sii.credentials
    CASCADE;
  `);
}

// ── Raw DDL for all tables ──────────────────────────────────────────────

const SCHEMA_SQL = `
CREATE SCHEMA IF NOT EXISTS sii;

-- Credentials
CREATE TABLE IF NOT EXISTS sii.credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  env TEXT NOT NULL,
  cert_base64 TEXT,
  cert_password TEXT,
  portal_rut TEXT,
  portal_password TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, env)
);

-- Token cache
CREATE TABLE IF NOT EXISTS sii.token_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id UUID NOT NULL REFERENCES sii.credentials(id) ON DELETE CASCADE,
  token_type TEXT NOT NULL,
  token_value TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE(credential_id, token_type)
);

-- Invoices
CREATE TABLE IF NOT EXISTS sii.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  document_type TEXT NOT NULL,
  number INTEGER NOT NULL,
  issuer_rut TEXT,
  issuer_name TEXT,
  receiver_rut TEXT,
  receiver_name TEXT,
  date DATE,
  net_amount NUMERIC(16,0),
  exempt_amount NUMERIC(16,0),
  vat_amount NUMERIC(16,0),
  total_amount NUMERIC(16,0),
  tax_period_year INTEGER NOT NULL,
  tax_period_month INTEGER NOT NULL,
  issue_type TEXT NOT NULL,
  confirmation_status TEXT,
  raw JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, document_type, number, issuer_rut, receiver_rut, issue_type)
);
CREATE INDEX IF NOT EXISTS idx_sii_invoices_tenant_period
  ON sii.invoices(tenant_id, tax_period_year, tax_period_month);

-- Sync jobs
CREATE TABLE IF NOT EXISTS sii.sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  operation TEXT NOT NULL,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL,
  issue_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  records_fetched INTEGER,
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
`;
