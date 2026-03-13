/**
 * Converts between DB rows and engine Invoice type.
 */

import type { Invoice, IssueType } from "@emisso/sii";
import type { InvoiceRow, NewInvoiceRow } from "../db/schema/index.js";

/**
 * Convert an engine Invoice to a DB row for upsert.
 */
export function invoiceToRow(
  tenantId: string,
  invoice: Invoice,
  issueType: IssueType,
): Omit<NewInvoiceRow, "id" | "createdAt" | "updatedAt"> {
  return {
    tenantId,
    documentType: invoice.documentType,
    number: invoice.number,
    issuerRut: invoice.issuer.rut || null,
    issuerName: invoice.issuer.name || null,
    receiverRut: invoice.receiver.rut || null,
    receiverName: invoice.receiver.name || null,
    date: invoice.date || null,
    netAmount: String(invoice.netAmount),
    exemptAmount: String(invoice.exemptAmount),
    vatAmount: String(invoice.vatAmount),
    totalAmount: String(invoice.totalAmount),
    taxPeriodYear: invoice.taxPeriod.year,
    taxPeriodMonth: invoice.taxPeriod.month,
    issueType,
    confirmationStatus: invoice.confirmationStatus ?? null,
    raw: invoice.raw ?? null,
  };
}

/**
 * Convert a DB row back to an engine-compatible Invoice.
 */
export function rowToInvoice(row: InvoiceRow): Invoice {
  return {
    id: `${row.documentType}-${row.number}-${row.issuerRut || row.receiverRut || ""}`,
    number: row.number,
    issuer: {
      rut: row.issuerRut ?? "",
      name: row.issuerName ?? "",
    },
    receiver: {
      rut: row.receiverRut ?? "",
      name: row.receiverName ?? "",
    },
    date: row.date ?? "",
    netAmount: Number(row.netAmount ?? 0),
    exemptAmount: Number(row.exemptAmount ?? 0),
    vatAmount: Number(row.vatAmount ?? 0),
    totalAmount: Number(row.totalAmount ?? 0),
    currency: "CLP",
    taxPeriod: {
      year: row.taxPeriodYear,
      month: row.taxPeriodMonth,
    },
    documentType: row.documentType,
    confirmationStatus: row.confirmationStatus ?? "REGISTRO",
    raw: row.raw ?? {},
  };
}
