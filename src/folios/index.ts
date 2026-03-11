import type { DteType, FolioRange, SiiConfig } from "../types";
import type { SiiToken } from "../auth";

/**
 * Parses a CAF (Codigo de Autorizacion de Folios) XML file.
 * Extracts the folio range, keys, and authorization metadata.
 */
export async function parseCaf(_cafXml: string): Promise<FolioRange> {
  // TODO: Parse CAF XML, extract AUTORIZACION > CAF > DA (range, keys)
  throw new Error("Not implemented");
}

/**
 * Loads a CAF file from the filesystem.
 */
export async function loadCafFromFile(_filePath: string): Promise<FolioRange> {
  // TODO: Read file and delegate to parseCaf
  throw new Error("Not implemented");
}

/**
 * Requests a new folio range from SII.
 * Requires authentication and an authorized company.
 */
export async function requestFolios(
  _tipoDte: DteType,
  _cantidad: number,
  _token: SiiToken,
  _config: SiiConfig
): Promise<FolioRange> {
  // TODO: POST folio request to SII
  throw new Error("Not implemented");
}

/**
 * Checks the remaining available folios for a given DTE type.
 */
export async function checkFolioAvailability(
  _tipoDte: DteType,
  _token: SiiToken,
  _config: SiiConfig
): Promise<{ remaining: number; rangeStart: number; rangeEnd: number }> {
  // TODO: Query SII for current folio status
  throw new Error("Not implemented");
}
