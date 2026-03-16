import { describe, expect, it } from "vitest";
import { formatTable, formatCsv } from "@emisso/cli-core";
import {
  rutColumns,
  certColumns,
  authColumns,
  invoiceColumns,
} from "../src/formatters/sii-table";

describe("Column definitions", () => {
  const allColumnSets = [
    { name: "rutColumns", columns: rutColumns },
    { name: "certColumns", columns: certColumns },
    { name: "authColumns", columns: authColumns },
    { name: "invoiceColumns", columns: invoiceColumns },
  ];

  for (const { name, columns } of allColumnSets) {
    it(`${name} has valid Column shapes`, () => {
      expect(columns.length).toBeGreaterThan(0);
      for (const col of columns) {
        expect(col).toHaveProperty("key");
        expect(col).toHaveProperty("label");
        expect(typeof col.key).toBe("string");
        expect(typeof col.label).toBe("string");
      }
    });
  }
});

describe("formatTable with invoice columns", () => {
  it("renders invoices as a table", () => {
    const rows = [
      {
        number: "123",
        documentType: "33",
        date: "2024-03-15",
        issuerRut: "76123456-K",
        issuerName: "Empresa SA",
        receiverRut: "77654321-5",
        receiverName: "Cliente Ltda",
        netAmount: "1.000.000",
        vatAmount: "190.000",
        totalAmount: "1.190.000",
      },
    ];

    const output = formatTable(invoiceColumns, rows);
    expect(output).toContain("#");
    expect(output).toContain("Type");
    expect(output).toContain("123");
    expect(output).toContain("33");
    expect(output).toContain("Empresa SA");
    expect(output).toContain("1.190.000");
  });
});

describe("formatCsv with cert columns", () => {
  it("renders cert info as CSV", () => {
    const csvColumns = certColumns.map((c) => ({
      key: c.key,
      label: c.label,
    }));

    const rows = [
      { field: "Subject", value: "CN=Test User" },
      { field: "Issuer", value: "CN=Test CA" },
    ];

    const output = formatCsv(csvColumns, rows);
    expect(output).toContain("Field");
    expect(output).toContain("Value");
    expect(output).toContain("CN=Test User");
  });
});
