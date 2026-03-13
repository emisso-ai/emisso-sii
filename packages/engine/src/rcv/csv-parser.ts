import type { DteType, Invoice, IssueType } from "../types";

/**
 * Strip UTF-8 BOM if present.
 */
function stripBom(text: string): string {
  if (text.charCodeAt(0) === 0xfeff) {
    return text.slice(1);
  }
  return text;
}

/**
 * Parse an SII date string (DD/MM/YYYY or YYYY-MM-DD) to ISO date (YYYY-MM-DD).
 */
function parseSiiDate(raw: string): string {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  return trimmed;
}

/**
 * Parse a numeric value from SII CSV. Handles dots as thousand separators
 * and commas as decimal separators (Chilean format).
 */
function parseSiiNumber(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "") return 0;
  const cleaned = trimmed.replace(/\./g, "").replace(",", ".");
  const num = Number(cleaned);
  return Number.isNaN(num) ? 0 : num;
}

/**
 * Map SII document type code to our DteType enum value.
 */
function mapDocumentType(raw: string): DteType {
  const trimmed = raw.trim();
  const validTypes = ["33", "34", "39", "41", "43", "46", "52", "56", "61", "110", "112"];
  if (validTypes.includes(trimmed)) return trimmed as DteType;
  return "33";
}

/**
 * Find a column value by trying multiple possible header names.
 * SII CSV headers vary between environments and export endpoints.
 *
 * Real column headers discovered from the Angular SPA templates:
 *
 * Compras: Tipo Doc, Tipo Compra, RUT Proveedor, Folio, Fecha Docto.,
 *   Fecha Recepción, Fecha Acuse Recibo, Monto Exento, Monto Neto,
 *   Monto IVA Recuperable, Total Otros Impuestos, Monto Iva No Recuperable,
 *   Código Iva No Recuperable, Monto Total, Monto Neto Activo Fijo,
 *   IVA Activo Fijo, IVA uso Común, Impto. Sin Derecho a Crédito,
 *   IVA No Retenido, Tipo Docto. Referencia, Folio Docto. Referencia,
 *   Tabacos Puros, Tabacos Cigarrillos, Tabacos Elaborados,
 *   NCE o NDE sobre Fact. de Compra
 *
 * Ventas: Tipo Doc, RUT Cliente, Folio, Fecha Docto., Fecha Recepción,
 *   Monto Exento, Monto Neto, Monto IVA, Monto Total
 */
function findColumn(
  row: Record<string, string>,
  ...candidates: string[]
): string {
  for (const name of candidates) {
    if (name in row && row[name].trim() !== "") {
      return row[name].trim();
    }
  }
  return "";
}

/**
 * Parse semicolon-delimited RCV CSV into Invoice objects.
 *
 * @param csv - Raw CSV string from SII "Descargar Detalles" / getDetalle*Export
 * @param issueType - Whether these are issued (ventas) or received (compras) invoices
 * @param period - Tax period for these invoices
 */
export function parseRcvCsv(
  csv: string,
  issueType: IssueType,
  period: { year: number; month: number },
): Invoice[] {
  const clean = stripBom(csv);
  const lines = clean.split(/\r?\n/).filter((line) => line.trim() !== "");

  if (lines.length < 2) return [];

  const headers = lines[0].split(";").map((h) => h.trim());
  const invoices: Invoice[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(";");
    if (values.length < 3) continue;

    const raw: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      raw[headers[j]] = (values[j] ?? "").trim();
    }

    const folio = findColumn(raw, "Folio");
    const tipoDte = findColumn(raw, "Tipo Doc", "Tipo Documento", "Tipo DTE");
    const fecha = findColumn(raw, "Fecha Docto", "Fecha Docto.", "Fecha Documento", "Fecha");

    if (!folio || !tipoDte) continue;

    // Counterpart RUT: in Compras it's the provider, in Ventas the client
    const counterpartRut =
      issueType === "issued"
        ? findColumn(raw, "RUT Cliente", "Rut Cliente", "RUT Receptor")
        : findColumn(raw, "RUT Proveedor", "Rut Proveedor", "RUT Emisor");

    const counterpartName =
      issueType === "issued"
        ? findColumn(raw, "Razon Social", "Razón Social", "Nombre Cliente")
        : findColumn(raw, "Razon Social", "Razón Social", "Nombre Proveedor");

    const documentType = mapDocumentType(tipoDte);
    const folioNum = parseInt(folio, 10);

    const issuer =
      issueType === "issued"
        ? { rut: "", name: "" }
        : { rut: counterpartRut, name: counterpartName };

    const receiver =
      issueType === "issued"
        ? { rut: counterpartRut, name: counterpartName }
        : { rut: "", name: "" };

    // Amount columns — Compras uses "Monto IVA Recuperable", Ventas uses "Monto IVA"
    const netAmount = parseSiiNumber(findColumn(raw, "Monto Neto", "Neto"));
    const exemptAmount = parseSiiNumber(findColumn(raw, "Monto Exento", "Exento"));
    const vatAmount = parseSiiNumber(
      findColumn(raw, "Monto IVA Recuperable", "Monto IVA", "IVA"),
    );
    const totalAmount = parseSiiNumber(findColumn(raw, "Monto Total", "Total"));

    const confirmationRaw = findColumn(raw, "Estado", "Estado Receptor", "Estado SII");

    const invoice: Invoice = {
      id: `${documentType}-${folioNum}-${counterpartRut}`,
      number: folioNum,
      issuer,
      receiver,
      date: parseSiiDate(fecha),
      netAmount,
      exemptAmount,
      vatAmount,
      totalAmount,
      currency: "CLP",
      taxPeriod: period,
      documentType,
      confirmationStatus: mapConfirmationStatus(confirmationRaw),
      raw,
    };

    invoices.push(invoice);
  }

  return invoices;
}

function mapConfirmationStatus(
  raw: string,
): Invoice["confirmationStatus"] {
  const upper = raw.toUpperCase();
  if (upper.includes("RECLAMADO") || upper.includes("RECLAMO")) return "RECLAMADO";
  if (upper.includes("PENDIENTE")) return "PENDIENTE";
  return "REGISTRO";
}

export { stripBom, parseSiiDate, parseSiiNumber, mapDocumentType };
