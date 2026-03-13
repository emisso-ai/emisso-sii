import { describe, it, expect } from "vitest";
import {
  parseRcvCsv,
  stripBom,
  parseSiiDate,
  parseSiiNumber,
  mapDocumentType,
} from "../src/rcv/csv-parser";
import { InvoiceSchema, IssueTypeSchema } from "../src/types";

// --- Helper: build sample CSV ---

const VENTAS_HEADERS = [
  "Nro",
  "Tipo Doc",
  "Tipo Compra",
  "RUT Cliente",
  "Razon Social",
  "Folio",
  "Fecha Docto",
  "Fecha Recepcion",
  "Fecha Acuse",
  "Monto Exento",
  "Monto Neto",
  "Monto IVA",
  "Monto Total",
].join(";");

const COMPRAS_HEADERS = [
  "Nro",
  "Tipo Doc",
  "Tipo Compra",
  "RUT Proveedor",
  "Razon Social",
  "Folio",
  "Fecha Docto",
  "Fecha Recepcion",
  "Fecha Acuse",
  "Monto Exento",
  "Monto Neto",
  "Monto IVA",
  "Monto Total",
].join(";");

function buildVentasCsv(rows: string[]): string {
  return [VENTAS_HEADERS, ...rows].join("\n");
}

function buildComprasCsv(rows: string[]): string {
  return [COMPRAS_HEADERS, ...rows].join("\n");
}

// --- Unit tests: internal helpers ---

describe("stripBom", () => {
  it("removes UTF-8 BOM", () => {
    expect(stripBom("\uFEFFhello")).toBe("hello");
  });

  it("leaves strings without BOM unchanged", () => {
    expect(stripBom("hello")).toBe("hello");
  });
});

describe("parseSiiDate", () => {
  it("converts DD/MM/YYYY to ISO", () => {
    expect(parseSiiDate("15/03/2024")).toBe("2024-03-15");
  });

  it("passes through ISO dates", () => {
    expect(parseSiiDate("2024-03-15")).toBe("2024-03-15");
  });

  it("handles whitespace", () => {
    expect(parseSiiDate("  15/03/2024  ")).toBe("2024-03-15");
  });
});

describe("parseSiiNumber", () => {
  it("parses simple integers", () => {
    expect(parseSiiNumber("1000")).toBe(1000);
  });

  it("handles Chilean thousand separators (dots)", () => {
    expect(parseSiiNumber("1.234.567")).toBe(1234567);
  });

  it("handles comma decimal separator", () => {
    expect(parseSiiNumber("1.234,56")).toBe(1234.56);
  });

  it("returns 0 for empty string", () => {
    expect(parseSiiNumber("")).toBe(0);
    expect(parseSiiNumber("  ")).toBe(0);
  });
});

describe("mapDocumentType", () => {
  it("maps known document types", () => {
    expect(mapDocumentType("33")).toBe("33");
    expect(mapDocumentType("61")).toBe("61");
    expect(mapDocumentType("110")).toBe("110");
  });

  it("defaults unknown types to 33", () => {
    expect(mapDocumentType("99")).toBe("33");
    expect(mapDocumentType("")).toBe("33");
  });
});

// --- CSV parsing tests ---

describe("parseRcvCsv", () => {
  const period = { year: 2024, month: 3 };

  it("parses Ventas (issued) CSV", () => {
    const csv = buildVentasCsv([
      "1;33;;12345678-9;EMPRESA TEST SPA;1001;15/03/2024;;;0;100.000;19.000;119.000",
    ]);
    const invoices = parseRcvCsv(csv, "issued", period);

    expect(invoices).toHaveLength(1);
    const inv = invoices[0];
    expect(inv.number).toBe(1001);
    expect(inv.documentType).toBe("33");
    expect(inv.receiver.rut).toBe("12345678-9");
    expect(inv.receiver.name).toBe("EMPRESA TEST SPA");
    expect(inv.date).toBe("2024-03-15");
    expect(inv.netAmount).toBe(100000);
    expect(inv.vatAmount).toBe(19000);
    expect(inv.totalAmount).toBe(119000);
    expect(inv.exemptAmount).toBe(0);
    expect(inv.currency).toBe("CLP");
    expect(inv.taxPeriod).toEqual(period);
    expect(inv.id).toBe("33-1001-12345678-9");
  });

  it("parses Compras (received) CSV", () => {
    const csv = buildComprasCsv([
      "1;33;;76543210-K;PROVEEDOR LTDA;2002;01/03/2024;;;500;10.000;1.900;12.400",
    ]);
    const invoices = parseRcvCsv(csv, "received", period);

    expect(invoices).toHaveLength(1);
    const inv = invoices[0];
    expect(inv.number).toBe(2002);
    expect(inv.issuer.rut).toBe("76543210-K");
    expect(inv.issuer.name).toBe("PROVEEDOR LTDA");
    expect(inv.netAmount).toBe(10000);
    expect(inv.exemptAmount).toBe(500);
    expect(inv.vatAmount).toBe(1900);
    expect(inv.totalAmount).toBe(12400);
  });

  it("parses multiple rows", () => {
    const csv = buildVentasCsv([
      "1;33;;11111111-1;CLIENTE A;100;01/03/2024;;;0;50.000;9.500;59.500",
      "2;61;;22222222-2;CLIENTE B;200;02/03/2024;;;0;30.000;5.700;35.700",
    ]);
    const invoices = parseRcvCsv(csv, "issued", period);

    expect(invoices).toHaveLength(2);
    expect(invoices[0].number).toBe(100);
    expect(invoices[0].documentType).toBe("33");
    expect(invoices[1].number).toBe(200);
    expect(invoices[1].documentType).toBe("61");
  });

  it("returns empty array for header-only CSV", () => {
    expect(parseRcvCsv(VENTAS_HEADERS, "issued", period)).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(parseRcvCsv("", "issued", period)).toEqual([]);
  });

  it("handles BOM prefix", () => {
    const csv = "\uFEFF" + buildVentasCsv([
      "1;33;;12345678-9;TEST;999;10/03/2024;;;0;1000;190;1190",
    ]);
    const invoices = parseRcvCsv(csv, "issued", period);
    expect(invoices).toHaveLength(1);
    expect(invoices[0].number).toBe(999);
  });

  it("handles Windows-style line endings (CRLF)", () => {
    const csv = [
      VENTAS_HEADERS,
      "1;33;;12345678-9;TEST;500;05/03/2024;;;0;2000;380;2380",
    ].join("\r\n");
    const invoices = parseRcvCsv(csv, "issued", period);
    expect(invoices).toHaveLength(1);
  });

  it("skips malformed rows", () => {
    const csv = buildVentasCsv([
      "1;33;;12345678-9;GOOD ROW;100;01/03/2024;;;0;1000;190;1190",
      "bad",
      "2;33;;99999999-9;ANOTHER GOOD;200;02/03/2024;;;0;2000;380;2380",
    ]);
    const invoices = parseRcvCsv(csv, "issued", period);
    expect(invoices).toHaveLength(2);
  });

  it("preserves all raw CSV fields", () => {
    const csv = buildVentasCsv([
      "1;33;FACTURA;12345678-9;TEST;100;01/03/2024;02/03/2024;03/03/2024;0;1000;190;1190",
    ]);
    const invoices = parseRcvCsv(csv, "issued", period);
    expect(invoices[0].raw["Tipo Compra"]).toBe("FACTURA");
    expect(invoices[0].raw["Fecha Recepcion"]).toBe("02/03/2024");
    expect(invoices[0].raw["Fecha Acuse"]).toBe("03/03/2024");
  });

  it("produces Invoice objects that pass Zod validation", () => {
    const csv = buildComprasCsv([
      "1;33;;76123456-7;ACME SPA;300;20/03/2024;;;0;50.000;9.500;59.500",
    ]);
    const invoices = parseRcvCsv(csv, "received", period);
    const result = InvoiceSchema.safeParse(invoices[0]);
    expect(result.success).toBe(true);
  });
});

// --- Zod schema tests ---

describe("IssueTypeSchema", () => {
  it("accepts valid values", () => {
    expect(IssueTypeSchema.safeParse("issued").success).toBe(true);
    expect(IssueTypeSchema.safeParse("received").success).toBe(true);
  });

  it("rejects invalid values", () => {
    expect(IssueTypeSchema.safeParse("invalid").success).toBe(false);
  });
});

// --- Integration test (requires real SII credentials) ---

describe.skipIf(!process.env.SII_PORTAL_RUT)("integration: RCV list invoices", () => {
  it("downloads and parses invoices from SII", async () => {
    const { portalLogin, listInvoices } = await import("../src/index");

    const session = await portalLogin(
      {
        rut: process.env.SII_PORTAL_RUT!,
        claveTributaria: process.env.SII_PORTAL_PASSWORD!,
        env: (process.env.SII_ENV as "certification" | "production") || "production",
      },
      { headless: true },
    );

    // Try current month — may be empty, that's fine
    const now = new Date();
    const invoices = await listInvoices(session, {
      rut: process.env.SII_PORTAL_RUT!,
      issueType: "received",
      period: { year: now.getFullYear(), month: now.getMonth() + 1 },
    });

    expect(Array.isArray(invoices)).toBe(true);
    // If we got data, validate the structure
    if (invoices.length > 0) {
      const result = InvoiceSchema.safeParse(invoices[0]);
      expect(result.success).toBe(true);
      expect(invoices[0].currency).toBe("CLP");
      expect(invoices[0].taxPeriod.year).toBe(now.getFullYear());
    }
  }, 120_000); // 2 minute timeout for browser login + HTTP fetch
});
