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
  jsonResponse,
  createdResponse,
  toErrorResponseFromUnknown,
} from "../core/effect/http-response.js";

export function createInvoiceHandlers(deps: {
  invoiceService: InvoiceService;
  invoiceRepo: InvoiceRepo;
  syncJobRepo: SyncJobRepo;
}) {
  const { invoiceService, invoiceRepo, syncJobRepo } = deps;

  const listInvoices: HandlerFn = async (req, ctx) => {
    try {
      const url = new URL(req.url);
      const query = ListInvoicesQuerySchema.safeParse(
        Object.fromEntries(url.searchParams),
      );
      if (!query.success) {
        throw ValidationError.fromZodErrors(
          "Invalid query parameters",
          query.error.issues,
        );
      }

      const { period, type, documentType, limit, offset } = query.data;
      let periodYear: number | undefined;
      let periodMonth: number | undefined;
      if (period) {
        const parsed = parsePeriod(period);
        periodYear = parsed.year;
        periodMonth = parsed.month;
      }

      const rows = await Effect.runPromise(
        invoiceRepo.list(ctx.tenantId, {
          periodYear,
          periodMonth,
          issueType: type,
          documentType,
          limit,
          offset,
        }),
      );

      const invoices = rows.map(rowToInvoice);
      return jsonResponse({ data: invoices, count: invoices.length });
    } catch (e) {
      return toErrorResponseFromUnknown(e);
    }
  };

  const syncInvoices: HandlerFn = async (req, ctx) => {
    try {
      const body = await req.json();
      const parsed = SyncInvoicesSchema.safeParse(body);
      if (!parsed.success) {
        throw ValidationError.fromZodErrors(
          "Invalid sync parameters",
          parsed.error.issues,
        );
      }

      const { year: periodYear, month: periodMonth } = parsePeriod(parsed.data.period);
      const env = resolveEnv(req);

      const job = await Effect.runPromise(
        invoiceService.sync(
          ctx.tenantId,
          env,
          periodYear,
          periodMonth,
          parsed.data.type,
        ),
      );

      return createdResponse(job);
    } catch (e) {
      return toErrorResponseFromUnknown(e);
    }
  };

  const getSyncStatus: HandlerFn = async (req, ctx) => {
    try {
      const url = new URL(req.url);
      const query = SyncStatusQuerySchema.safeParse(
        Object.fromEntries(url.searchParams),
      );
      if (!query.success) {
        throw ValidationError.fromZodErrors(
          "Invalid query parameters",
          query.error.issues,
        );
      }

      const { period, type } = query.data;
      let periodYear: number | undefined;
      let periodMonth: number | undefined;
      if (period) {
        const parsed = parsePeriod(period);
        periodYear = parsed.year;
        periodMonth = parsed.month;
      }

      const jobs = await Effect.runPromise(
        syncJobRepo.listByTenant(ctx.tenantId, {
          periodYear,
          periodMonth,
          issueType: type,
        }),
      );

      return jsonResponse({ data: jobs });
    } catch (e) {
      return toErrorResponseFromUnknown(e);
    }
  };

  return {
    listInvoices,
    syncInvoices,
    getSyncStatus,
  };
}
