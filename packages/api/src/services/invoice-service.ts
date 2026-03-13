import { Effect } from "effect";
import { listInvoices, type IssueType, type SiiEnv } from "@emisso/sii";
import type { InvoiceRepo } from "../repos/invoice-repo.js";
import type { SyncJobRepo } from "../repos/sync-job-repo.js";
import type { AuthService } from "./auth-service.js";
import type { CredentialRepo } from "../repos/credential-repo.js";
import type { SyncJob } from "../db/schema/index.js";
import { invoiceToRow } from "../core/bridge.js";
import { SiiAuthError, type AppError } from "../core/effect/app-error.js";

export function createInvoiceService(deps: {
  invoiceRepo: InvoiceRepo;
  syncJobRepo: SyncJobRepo;
  authService: AuthService;
  credentialRepo: CredentialRepo;
}) {
  const { invoiceRepo, syncJobRepo, authService, credentialRepo } = deps;

  return {
    /**
     * Trigger an RCV invoice sync for a given period.
     * Creates a sync job, fetches from SII, upserts into DB.
     */
    sync(
      tenantId: string,
      env: SiiEnv,
      periodYear: number,
      periodMonth: number,
      issueType: IssueType,
    ): Effect.Effect<SyncJob, AppError> {
      return Effect.gen(function* () {
        // Create sync job
        const job = yield* syncJobRepo.create({
          tenantId,
          operation: "rcv_sync",
          periodYear,
          periodMonth,
          issueType,
          status: "running",
          startedAt: new Date(),
        });

        /** Mark job as failed and re-raise the error */
        const failJob = (err: AppError) =>
          syncJobRepo.update(job.id, {
            status: "failed",
            completedAt: new Date(),
            errorMessage: err.message,
          }).pipe(Effect.flatMap(() => Effect.fail(err)));

        // Get credential to find the RUT
        const cred = yield* credentialRepo.getByTenantAndEnv(tenantId, env);
        if (!cred.portalRut) {
          const err = SiiAuthError.make("No portal RUT configured for RCV sync");
          return yield* failJob(err);
        }

        // Get portal session
        const session = yield* authService
          .getPortalSession(tenantId, env)
          .pipe(Effect.catchAll(failJob));

        // Fetch invoices from SII
        const siiInvoices = yield* Effect.tryPromise({
          try: () =>
            listInvoices(session, {
              rut: cred.portalRut!,
              issueType,
              period: { year: periodYear, month: periodMonth },
            }),
          catch: (e) =>
            SiiAuthError.make(
              `RCV fetch failed: ${e instanceof Error ? e.message : String(e)}`,
              e,
            ),
        }).pipe(Effect.catchAll(failJob));

        // Convert and upsert
        const rows = siiInvoices.map((inv) =>
          invoiceToRow(tenantId, inv, issueType),
        );
        const count = yield* invoiceRepo.upsertMany(rows);

        // Complete the job
        return yield* syncJobRepo.update(job.id, {
          status: "completed",
          completedAt: new Date(),
          recordsFetched: count,
        });
      });
    },
  };
}

export type InvoiceService = ReturnType<typeof createInvoiceService>;
