import type { DteType, SiiConfig, SiiStatusResponse } from "../types";
import type { SiiToken } from "../auth";

/**
 * Queries the status of a DTE upload by its tracking ID.
 * Use the trackId returned from uploadDte().
 */
export async function queryUploadStatus(
  _trackId: string,
  _token: SiiToken,
  _config: SiiConfig
): Promise<SiiStatusResponse> {
  // TODO: GET /DTEWS/QueryEstUp.jws with trackId
  throw new Error("Not implemented");
}

/**
 * Queries the status of a specific DTE document.
 * Checks whether SII has accepted or rejected the document.
 */
export async function queryDteStatus(
  _rutEmisor: string,
  _tipoDte: DteType,
  _folio: number,
  _token: SiiToken,
  _config: SiiConfig
): Promise<SiiStatusResponse> {
  // TODO: GET /DTEWS/QueryEstDte.jws with document identifiers
  throw new Error("Not implemented");
}

/**
 * Queries the status of a sent DTE envelope (EnvioDTE).
 */
export async function queryEnvioStatus(
  _trackId: string,
  _rutEmisor: string,
  _token: SiiToken,
  _config: SiiConfig
): Promise<SiiStatusResponse> {
  // TODO: Query SII for EnvioDTE processing status
  throw new Error("Not implemented");
}
