import { Effect } from "effect";
import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { IssueType, DteType } from "@emisso/sii";
import { invoices, type InvoiceRow, type NewInvoiceRow } from "../db/schema/index.js";
import { DbError } from "../core/effect/app-error.js";

export function createInvoiceRepo(db: PgDatabase<any>) {
  return {
    list(
      tenantId: string,
      filters?: {
        periodYear?: number;
        periodMonth?: number;
        issueType?: IssueType;
        documentType?: DteType;
        limit?: number;
        offset?: number;
      },
    ): Effect.Effect<InvoiceRow[], DbError> {
      return Effect.tryPromise({
        try: () => {
          const conditions = [eq(invoices.tenantId, tenantId)];
          if (filters?.periodYear !== undefined) {
            conditions.push(eq(invoices.taxPeriodYear, filters.periodYear));
          }
          if (filters?.periodMonth !== undefined) {
            conditions.push(eq(invoices.taxPeriodMonth, filters.periodMonth));
          }
          if (filters?.issueType) {
            conditions.push(eq(invoices.issueType, filters.issueType));
          }
          if (filters?.documentType) {
            conditions.push(eq(invoices.documentType, filters.documentType));
          }
          return db
            .select()
            .from(invoices)
            .where(and(...conditions))
            .limit(filters?.limit ?? 100)
            .offset(filters?.offset ?? 0);
        },
        catch: (e) => DbError.make("invoice.list", e),
      });
    },

    upsertMany(
      rows: Omit<NewInvoiceRow, "id" | "createdAt" | "updatedAt">[],
    ): Effect.Effect<number, DbError> {
      if (rows.length === 0) return Effect.succeed(0);
      return Effect.tryPromise({
        try: () =>
          db
            .insert(invoices)
            .values(rows)
            .onConflictDoUpdate({
              target: [
                invoices.tenantId,
                invoices.documentType,
                invoices.number,
                invoices.issuerRut,
                invoices.receiverRut,
                invoices.issueType,
              ],
              set: {
                issuerName: sql`excluded.issuer_name`,
                receiverName: sql`excluded.receiver_name`,
                date: sql`excluded.date`,
                netAmount: sql`excluded.net_amount`,
                exemptAmount: sql`excluded.exempt_amount`,
                vatAmount: sql`excluded.vat_amount`,
                totalAmount: sql`excluded.total_amount`,
                confirmationStatus: sql`excluded.confirmation_status`,
                raw: sql`excluded.raw`,
                updatedAt: new Date(),
              },
            })
            .returning({ id: invoices.id })
            .then((rows) => rows.length),
        catch: (e) => DbError.make("invoice.upsertMany", e),
      });
    },

    count(
      tenantId: string,
      filters?: {
        periodYear?: number;
        periodMonth?: number;
        issueType?: IssueType;
      },
    ): Effect.Effect<number, DbError> {
      return Effect.tryPromise({
        try: () => {
          const conditions = [eq(invoices.tenantId, tenantId)];
          if (filters?.periodYear !== undefined) {
            conditions.push(eq(invoices.taxPeriodYear, filters.periodYear));
          }
          if (filters?.periodMonth !== undefined) {
            conditions.push(eq(invoices.taxPeriodMonth, filters.periodMonth));
          }
          if (filters?.issueType) {
            conditions.push(eq(invoices.issueType, filters.issueType));
          }
          return db
            .select({ count: sql<number>`count(*)::int` })
            .from(invoices)
            .where(and(...conditions))
            .then((rows) => rows[0]?.count ?? 0);
        },
        catch: (e) => DbError.make("invoice.count", e),
      });
    },
  };
}

export type InvoiceRepo = ReturnType<typeof createInvoiceRepo>;
