import { describe, it, expect } from "vitest";
import type { Invoice } from "@emisso/sii";
import { invoiceToRow, rowToInvoice } from "../../src/core/bridge";
import type { InvoiceRow } from "../../src/db/schema/index";

describe("bridge", () => {
  const sampleInvoice: Invoice = {
    id: "33-1001-76123456-7",
    number: 1001,
    issuer: { rut: "76123456-7", name: "Empresa Test" },
    receiver: { rut: "12345678-9", name: "Cliente Test" },
    date: "2025-03-15",
    netAmount: 100000,
    exemptAmount: 0,
    vatAmount: 19000,
    totalAmount: 119000,
    currency: "CLP",
    taxPeriod: { year: 2025, month: 3 },
    documentType: "33",
    confirmationStatus: "REGISTRO",
    raw: { detTipoDoc: "33" },
  };

  it("converts Invoice to DB row", () => {
    const row = invoiceToRow("tenant-1", sampleInvoice, "received");
    expect(row.tenantId).toBe("tenant-1");
    expect(row.documentType).toBe("33");
    expect(row.number).toBe(1001);
    expect(row.issuerRut).toBe("76123456-7");
    expect(row.netAmount).toBe("100000");
    expect(row.totalAmount).toBe("119000");
    expect(row.issueType).toBe("received");
    expect(row.taxPeriodYear).toBe(2025);
    expect(row.taxPeriodMonth).toBe(3);
  });

  it("converts DB row back to Invoice", () => {
    const row: InvoiceRow = {
      id: "some-uuid",
      tenantId: "tenant-1",
      documentType: "33",
      number: 1001,
      issuerRut: "76123456-7",
      issuerName: "Empresa Test",
      receiverRut: "12345678-9",
      receiverName: "Cliente Test",
      date: "2025-03-15",
      netAmount: "100000",
      exemptAmount: "0",
      vatAmount: "19000",
      totalAmount: "119000",
      taxPeriodYear: 2025,
      taxPeriodMonth: 3,
      issueType: "received",
      confirmationStatus: "REGISTRO",
      raw: { detTipoDoc: "33" },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const invoice = rowToInvoice(row);
    expect(invoice.number).toBe(1001);
    expect(invoice.issuer.rut).toBe("76123456-7");
    expect(invoice.receiver.rut).toBe("12345678-9");
    expect(invoice.netAmount).toBe(100000);
    expect(invoice.totalAmount).toBe(119000);
    expect(invoice.documentType).toBe("33");
    expect(invoice.currency).toBe("CLP");
  });

  it("roundtrips Invoice → row → Invoice preserving key fields", () => {
    const row = invoiceToRow("tenant-1", sampleInvoice, "received");
    const fullRow: InvoiceRow = {
      id: "some-uuid",
      ...row,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const roundtripped = rowToInvoice(fullRow);

    expect(roundtripped.number).toBe(sampleInvoice.number);
    expect(roundtripped.documentType).toBe(sampleInvoice.documentType);
    expect(roundtripped.netAmount).toBe(sampleInvoice.netAmount);
    expect(roundtripped.totalAmount).toBe(sampleInvoice.totalAmount);
    expect(roundtripped.issuer.rut).toBe(sampleInvoice.issuer.rut);
    expect(roundtripped.receiver.rut).toBe(sampleInvoice.receiver.rut);
  });
});
