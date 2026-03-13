/**
 * Next.js App Router adapter for @emisso/sii-api.
 *
 * Usage in a Next.js catch-all route:
 *   // app/api/sii/[...path]/route.ts
 *   import { createSiiRouter } from "@emisso/sii-api/next";
 *   export const { GET, POST, PUT, DELETE } = createSiiRouter({ ... });
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { createRouter, type Route } from "../handlers/router.js";
import { createCredentialRepo } from "../repos/credential-repo.js";
import { createTokenCacheRepo } from "../repos/token-cache-repo.js";
import { createInvoiceRepo } from "../repos/invoice-repo.js";
import { createSyncJobRepo } from "../repos/sync-job-repo.js";
import { createCredentialService } from "../services/credential-service.js";
import { createAuthService } from "../services/auth-service.js";
import { createInvoiceService } from "../services/invoice-service.js";
import { createAuthHandlers } from "../handlers/auth-handlers.js";
import { createInvoiceHandlers } from "../handlers/invoice-handlers.js";

export interface SiiRouterConfig {
  /** PostgreSQL connection string */
  databaseUrl: string;
  /** Base path for the API routes (e.g., "/api/sii") */
  basePath: string;
  /**
   * Custom tenant ID resolver. Defaults to reading `X-Tenant-Id` header.
   * Return null to reject the request.
   */
  resolveTenantId?: (req: Request) => string | null | Promise<string | null>;
  /** Encrypt sensitive fields before storing in database */
  encrypt?: (plaintext: string) => string;
  /** Decrypt sensitive fields when reading from database */
  decrypt?: (ciphertext: string) => string;
  /** Connect to a remote browser (e.g., Browserbase) for portal login */
  connectBrowser?: () => Promise<import("playwright-core").Browser>;
}

export function createSiiRouter(config: SiiRouterConfig) {
  const sql = postgres(config.databaseUrl);
  const db: PostgresJsDatabase = drizzle(sql);

  // Build repos
  const credentialRepo = createCredentialRepo(db as any);
  const tokenCacheRepo = createTokenCacheRepo(db as any);
  const invoiceRepo = createInvoiceRepo(db as any);
  const syncJobRepo = createSyncJobRepo(db as any);

  // Build services
  const credentialService = createCredentialService({
    credentialRepo,
    tokenCacheRepo,
    encrypt: config.encrypt,
    decrypt: config.decrypt,
  });
  const authService = createAuthService({
    credentialRepo,
    tokenCacheRepo,
    decrypt: config.decrypt,
    connectBrowser: config.connectBrowser,
  });
  const invoiceService = createInvoiceService({
    invoiceRepo,
    syncJobRepo,
    authService,
    credentialRepo,
  });

  // Build handlers
  const authHandlers = createAuthHandlers({ credentialService, authService });
  const invoiceHandlers = createInvoiceHandlers({
    invoiceService,
    invoiceRepo,
    syncJobRepo,
  });

  const base = config.basePath;

  // Define routes
  const routes: Route[] = [
    // Auth / Credentials
    { method: "PUT", pattern: `${base}/auth`, handler: authHandlers.saveCredentials },
    { method: "GET", pattern: `${base}/auth`, handler: authHandlers.getStatus },
    { method: "POST", pattern: `${base}/auth/test`, handler: authHandlers.testConnection },
    { method: "DELETE", pattern: `${base}/auth`, handler: authHandlers.disconnect },

    // Invoices
    { method: "GET", pattern: `${base}/invoices`, handler: invoiceHandlers.listInvoices },
    { method: "POST", pattern: `${base}/invoices/sync`, handler: invoiceHandlers.syncInvoices },
    { method: "GET", pattern: `${base}/invoices/sync`, handler: invoiceHandlers.getSyncStatus },
  ];

  const router = createRouter(routes);

  const resolveTenantId =
    config.resolveTenantId ??
    ((req: Request) => req.headers.get("X-Tenant-Id"));

  async function handle(req: Request): Promise<Response> {
    const tenantId = await resolveTenantId(req);
    if (!tenantId) {
      return Response.json(
        { error: { _type: "ForbiddenError", message: "Missing tenant ID" } },
        { status: 403 },
      );
    }
    return router(req, tenantId);
  }

  return {
    GET: handle,
    POST: handle,
    PUT: handle,
    DELETE: handle,
  };
}
