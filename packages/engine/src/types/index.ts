import { z } from "zod";

// --- SII Environment ---

export const SiiEnvSchema = z.enum(["certification", "production"]);
export type SiiEnv = z.infer<typeof SiiEnvSchema>;

export const SiiConfigSchema = z.object({
  certPath: z.string(),
  certPassword: z.string(),
  env: SiiEnvSchema,
});
export type SiiConfig = z.infer<typeof SiiConfigSchema>;

// --- Emisor (Sender / Company issuing the DTE) ---

export const EmisorSchema = z.object({
  rut: z.string().describe("RUT of the issuing company, e.g. 76123456-7"),
  razonSocial: z.string().describe("Legal name"),
  giro: z.string().describe("Business activity description"),
  actividadEconomica: z.number().describe("SII economic activity code"),
  direccion: z.string(),
  comuna: z.string(),
  ciudad: z.string().optional(),
});
export type Emisor = z.infer<typeof EmisorSchema>;

// --- Receptor (Receiver / Customer) ---

export const ReceptorSchema = z.object({
  rut: z.string().describe("RUT of the receiver, e.g. 12345678-9"),
  razonSocial: z.string().describe("Legal name or person name"),
  giro: z.string().optional().describe("Business activity (required for facturas)"),
  direccion: z.string().optional(),
  comuna: z.string().optional(),
  ciudad: z.string().optional(),
});
export type Receptor = z.infer<typeof ReceptorSchema>;

// --- DTE Item (line item in a document) ---

export const DteItemSchema = z.object({
  nombre: z.string().describe("Item name/description"),
  cantidad: z.number().positive(),
  precioUnitario: z.number().nonnegative(),
  montoItem: z.number().nonnegative(),
  exento: z.boolean().optional().describe("Whether this item is tax-exempt"),
});
export type DteItem = z.infer<typeof DteItemSchema>;

// --- DTE Types (document types) ---

export const DteTypeSchema = z.enum([
  "33",  // Factura Electronica
  "34",  // Factura No Afecta o Exenta Electronica
  "39",  // Boleta Electronica
  "41",  // Boleta Exenta Electronica
  "43",  // Liquidacion Factura Electronica
  "46",  // Factura de Compra Electronica
  "52",  // Guia de Despacho Electronica
  "56",  // Nota de Debito Electronica
  "61",  // Nota de Credito Electronica
  "110", // Factura de Exportacion Electronica
  "112", // Nota de Credito de Exportacion Electronica
]);
export type DteType = z.infer<typeof DteTypeSchema>;

// --- DTE Document ---

export const DteDocumentSchema = z.object({
  tipoDte: DteTypeSchema,
  folio: z.number().positive(),
  fechaEmision: z.string().describe("ISO date string YYYY-MM-DD"),
  emisor: EmisorSchema,
  receptor: ReceptorSchema,
  items: z.array(DteItemSchema).min(1),
  montoNeto: z.number().nonnegative().optional(),
  montoExento: z.number().nonnegative().optional(),
  iva: z.number().nonnegative().optional(),
  montoTotal: z.number().nonnegative(),
  referencias: z
    .array(
      z.object({
        tipoDteRef: DteTypeSchema,
        folioRef: z.number(),
        fechaRef: z.string(),
        razonRef: z.string().optional(),
        codigoRef: z.enum(["1", "2", "3"]).optional().describe("1=Anula, 2=Corrige texto, 3=Corrige monto"),
      })
    )
    .optional(),
});
export type DteDocument = z.infer<typeof DteDocumentSchema>;

// --- Folio Range (CAF - Codigo de Autorizacion de Folios) ---

export const FolioRangeSchema = z.object({
  tipoDte: DteTypeSchema,
  rangoDesde: z.number().positive(),
  rangoHasta: z.number().positive(),
  fechaAutorizacion: z.string(),
  privateKey: z.string().optional().describe("RSA private key from CAF XML"),
  publicKey: z.string().optional().describe("RSA public key from CAF XML"),
});
export type FolioRange = z.infer<typeof FolioRangeSchema>;

// --- SII Response Types ---

export const SiiUploadResponseSchema = z.object({
  trackId: z.string().describe("Tracking ID returned by SII after upload"),
  timestamp: z.string(),
});
export type SiiUploadResponse = z.infer<typeof SiiUploadResponseSchema>;

export const DteStatusSchema = z.enum([
  "DOK", // Accepted
  "DNK", // Rejected
  "FAU", // Authentication failure
  "FAN", // DTE not found
  "EMP", // Company not authorized
  "TMD", // Too many queries
  "SOA", // Accepted with objections
]);
export type DteStatus = z.infer<typeof DteStatusSchema>;

export const SiiStatusResponseSchema = z.object({
  status: DteStatusSchema,
  glosa: z.string().describe("Human-readable status description"),
  numAtencion: z.string().optional(),
});
export type SiiStatusResponse = z.infer<typeof SiiStatusResponseSchema>;

export const RecepcionResponseSchema = z.object({
  accepted: z.boolean(),
  glosa: z.string(),
  detail: z.string().optional(),
});
export type RecepcionResponse = z.infer<typeof RecepcionResponseSchema>;

// --- Invoice Types (RCV - Registro de Compras y Ventas) ---

export const IssueTypeSchema = z.enum(["issued", "received"]);
export type IssueType = z.infer<typeof IssueTypeSchema>;

export const ConfirmationStatusSchema = z.enum(["REGISTRO", "RECLAMADO", "PENDIENTE"]);
export type ConfirmationStatus = z.infer<typeof ConfirmationStatusSchema>;

export const InvoiceSchema = z.object({
  id: z.string().describe("Composite key: ${tipoDte}-${folio}-${counterpartRut}"),
  number: z.number().describe("Folio number"),
  issuer: z.object({
    rut: z.string(),
    name: z.string(),
  }),
  receiver: z.object({
    rut: z.string(),
    name: z.string(),
  }),
  date: z.string().describe("ISO date YYYY-MM-DD"),
  netAmount: z.number(),
  exemptAmount: z.number(),
  vatAmount: z.number(),
  totalAmount: z.number(),
  currency: z.literal("CLP"),
  taxPeriod: z.object({
    year: z.number(),
    month: z.number(),
  }),
  documentType: DteTypeSchema,
  confirmationStatus: ConfirmationStatusSchema,
  raw: z.record(z.string()).describe("All original CSV fields preserved"),
});
export type Invoice = z.infer<typeof InvoiceSchema>;

// --- Portal Configuration ---

export const PortalConfigSchema = z.object({
  rut: z.string().describe("Full RUT with DV, e.g. 76123456-7"),
  claveTributaria: z.string().describe("SII portal password"),
  env: SiiEnvSchema,
});
export type PortalConfig = z.infer<typeof PortalConfigSchema>;
