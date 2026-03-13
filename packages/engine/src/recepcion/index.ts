import type { DteDocument, RecepcionResponse, SiiConfig } from "../types";
import type { SiiToken } from "../auth";

/**
 * Sends an acceptance response (Acuse de Recibo) for a received DTE.
 * This acknowledges receipt of the commercial content.
 */
export async function sendAcuseRecibo(
  _document: DteDocument,
  _token: SiiToken,
  _config: SiiConfig
): Promise<RecepcionResponse> {
  // TODO: Build RecepcionDTE XML and POST to sender
  throw new Error("Not implemented");
}

/**
 * Sends a merchandise receipt confirmation (Recibo de Mercaderias).
 * Confirms that goods/services were received.
 */
export async function sendReciboMercaderias(
  _document: DteDocument,
  _token: SiiToken,
  _config: SiiConfig
): Promise<RecepcionResponse> {
  // TODO: Build acceptance XML for merchandise receipt
  throw new Error("Not implemented");
}

/**
 * Sends a commercial acceptance or rejection (Resultado DTE).
 * Accepts or rejects the DTE for commercial purposes.
 */
export async function sendResultadoDte(
  _document: DteDocument,
  _accepted: boolean,
  _reason: string | undefined,
  _token: SiiToken,
  _config: SiiConfig
): Promise<RecepcionResponse> {
  // TODO: Build ResultadoDTE XML and POST
  throw new Error("Not implemented");
}
