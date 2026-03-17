import {
  date,
  index,
  integer,
  jsonb,
  numeric,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import type { DteType, IssueType, ConfirmationStatus } from "@emisso/sii";
import { siiSchema } from "./sii-schema.js";

export const invoices = siiSchema.table(
  "invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    documentType: text("document_type").notNull().$type<DteType>(),
    number: integer("number").notNull(),
    issuerRut: text("issuer_rut"),
    issuerName: text("issuer_name"),
    receiverRut: text("receiver_rut"),
    receiverName: text("receiver_name"),
    date: date("date"),
    netAmount: numeric("net_amount", { precision: 16, scale: 0 }),
    exemptAmount: numeric("exempt_amount", { precision: 16, scale: 0 }),
    vatAmount: numeric("vat_amount", { precision: 16, scale: 0 }),
    totalAmount: numeric("total_amount", { precision: 16, scale: 0 }),
    taxPeriodYear: integer("tax_period_year").notNull(),
    taxPeriodMonth: integer("tax_period_month").notNull(),
    issueType: text("issue_type").notNull().$type<IssueType>(),
    confirmationStatus: text("confirmation_status").$type<ConfirmationStatus>(),
    raw: jsonb("raw").$type<Record<string, string>>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("uq_invoices_natural_key").on(
      table.tenantId,
      table.documentType,
      table.number,
      table.issuerRut,
      table.receiverRut,
      table.issueType,
    ),
    index("idx_invoices_tenant_period").on(
      table.tenantId,
      table.taxPeriodYear,
      table.taxPeriodMonth,
    ),
  ],
);

export type InvoiceRow = typeof invoices.$inferSelect;
export type NewInvoiceRow = typeof invoices.$inferInsert;
