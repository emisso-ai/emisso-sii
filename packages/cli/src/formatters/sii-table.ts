/**
 * Column definitions for SII CLI output tables
 */

import type { Column } from "@emisso/cli-core";

export const rutColumns: Column[] = [
  { key: "field", label: "Campo" },
  { key: "value", label: "Valor" },
];

export const certColumns: Column[] = [
  { key: "field", label: "Field", width: 20 },
  { key: "value", label: "Value" },
];

export const authColumns: Column[] = [
  { key: "field", label: "Field", width: 16 },
  { key: "value", label: "Value" },
];

export const invoiceColumns: Column[] = [
  { key: "number", label: "#", width: 10, align: "right" },
  { key: "documentType", label: "Type", width: 6 },
  { key: "date", label: "Date", width: 12 },
  { key: "issuerRut", label: "Issuer RUT", width: 14 },
  { key: "issuerName", label: "Issuer", width: 20 },
  { key: "receiverRut", label: "Receiver RUT", width: 14 },
  { key: "receiverName", label: "Receiver", width: 20 },
  { key: "netAmount", label: "Net", align: "right" },
  { key: "vatAmount", label: "VAT", align: "right" },
  { key: "totalAmount", label: "Total", align: "right" },
];
