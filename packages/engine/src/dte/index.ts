import type { DteDocument, SiiConfig, SiiUploadResponse } from "../types";
import type { SiiToken } from "../auth";

/**
 * Builds the DTE XML document from structured data.
 * Includes the EnvioDTE envelope, SetDTE, and individual DTE XML.
 */
export async function buildDteXml(_document: DteDocument): Promise<string> {
  // TODO: Build XML using fast-xml-parser builder
  // Structure: EnvioDTE > SetDTE > DTE > Documento > Encabezado + Detalle
  throw new Error("Not implemented");
}

/**
 * Signs a DTE XML document with the digital certificate.
 * Applies XMLDSig to the document.
 */
export async function signDte(
  _xml: string,
  _certPath: string,
  _certPassword: string
): Promise<string> {
  // TODO: Sign DTE XML with certificate private key (XMLDSig)
  throw new Error("Not implemented");
}

/**
 * Sends a signed DTE to SII for processing.
 * Returns a tracking ID for status queries.
 */
export async function uploadDte(
  _signedXml: string,
  _token: SiiToken,
  _config: SiiConfig
): Promise<SiiUploadResponse> {
  // TODO: POST signed XML to SII upload endpoint
  throw new Error("Not implemented");
}

/**
 * Stamps a DTE with the CAF timbre (folio authorization).
 */
export async function applyTimbre(
  _xml: string,
  _cafPrivateKey: string
): Promise<string> {
  // TODO: Generate TED (Timbre Electronico DTE) and insert into XML
  throw new Error("Not implemented");
}

/**
 * Generates the PDF representation of a DTE (thermal or letter format).
 */
export async function generateDtePdf(
  _document: DteDocument,
  _options?: { format?: "thermal" | "letter" }
): Promise<Buffer> {
  // TODO: Generate PDF with barcode (PDF417 for timbre)
  throw new Error("Not implemented");
}
