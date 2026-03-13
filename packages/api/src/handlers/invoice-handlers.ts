import { Effect } from "effect";
import type { HandlerFn } from "./router.js";
import { resolveEnv, parsePeriod } from "./handler-utils.js";
import type { InvoiceService } from "../services/invoice-service.js";
import type { InvoiceRepo } from "../repos/invoice-repo.js";
import type { SyncJobRepo } from "../repos/sync-job-repo.js";
import {
  SyncInvoicesSchema,
  ListInvoicesQuerySchema,
  SyncStatusQuerySchema,
} from "../validation/schemas.js";
import { ValidationError } from "../core/effect/app-error.js";
import { rowToInvoice } from "../core/bridge.js";
import {
  createdResponse,
  handleEffect,
} from "../core/effect/http-response.js";

export function createInvoiceHandlers(deps: {
  invoiceService: InvoiceService;
  invoiceRepo: InvoiceRepo;
  syncJobRepo: SyncJobRepo;
}) {
  const { invoiceService, invoiceRepo, syncJobRepo } = deps;

  const listInvoices: HandlerFn = (req, ctx) =>
    handleEffect(
      Effect.gen(function* () {
        const url = new URL(req.url);
        const query = ListInvoicesQuerySchema.safeParse(
          Object.fromEntries(url.searchParams),
        );
        if (!query.success) {
          return yield* Effect.fail(
            ValidationError.fromZodErrors("Invalid query parameters", query.error.issues),
          );
        }

        const { period, type, documentType, limit, offset } = query.data;
        const periodParsed = period ? parsePeriod(period) : undefined;

        const rows = yield* invoiceRepo.list(ctx.tenantId, {
          periodYear: periodParsed?.year,
          periodMonth: periodParsed?.month,
          issueType: type,
          documentType,
          limit,
          offset,
        });

        return { data: rows.map(rowToInvoice), count: rows.length };
      }),
    );

  const syncInvoices: HandlerFn = (req, ctx) =>
    handleEffect(
      Effect.gen(function* () {
        const body = yield* Effect.tryPromise({
          try: () => req.json(),
          catch: () => ValidationError.make("Invalid JSON body"),
        });
        const parsed = SyncInvoicesSchema.safeParse(body);
        if (!parsed.success) {
          return yield* Effect.fail(
            ValidationError.fromZodErrors("Invalid sync parameters", parsed.error.issues),
          );
        }
        const { year: periodYear, month: periodMonth } = parsePeriod(parsed.data.period);
        const env = resolveEnv(req);
        return yield* invoiceService.sync(ctx.tenantId, env, periodYear, periodMonth, parsed.data.type);
      }),
      createdResponse,
    );

  const getSyncStatus: HandlerFn = (req, ctx) =>
    handleEffect(
      Effect.gen(function* () {
        const url = new URL(req.url);
        const query = SyncStatusQuerySchema.safeParse(
          Object.fromEntries(url.searchParams),
        );
        if (!query.success) {
          return yield* Effect.fail(
            ValidationError.fromZodErrors("Invalid query parameters", query.error.issues),
          );
        }
        const { period, type } = query.data;
        const periodParsed = period ? parsePeriod(period) : undefined;
        const jobs = yield* syncJobRepo.listByTenant(ctx.tenantId, {
          periodYear: periodParsed?.year,
          periodMonth: periodParsed?.month,
          issueType: type,
        });
        return { data: jobs };
      }),
    );

  return {
    listInvoices,
    syncInvoices,
    getSyncStatus,
  };
}
