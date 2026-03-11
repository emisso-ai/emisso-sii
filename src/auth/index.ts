import type { SiiConfig } from "../types";

export interface SiiToken {
  token: string;
  expiresAt: Date;
}

/**
 * Authenticates with SII using the digital certificate (.p12).
 * Returns a session token for subsequent API calls.
 *
 * Flow:
 * 1. Get seed from SII
 * 2. Sign seed with certificate private key
 * 3. Exchange signed seed for token
 */
export async function authenticate(_config: SiiConfig): Promise<SiiToken> {
  // TODO: Implement SII authentication flow
  // 1. GET /DTEWS/CrSeed.jws → extract seed
  // 2. Sign seed XML with certificate
  // 3. POST /DTEWS/GetTokenFromSeed.jws → extract token
  throw new Error("Not implemented");
}

/**
 * Retrieves the authentication seed from SII.
 */
export async function getSeed(_config: SiiConfig): Promise<string> {
  // TODO: GET request to SII seed endpoint, parse XML response
  throw new Error("Not implemented");
}

/**
 * Signs the seed XML using the digital certificate.
 */
export async function signSeed(
  _seed: string,
  _certPath: string,
  _certPassword: string
): Promise<string> {
  // TODO: Load .p12 certificate, extract private key, sign XML
  throw new Error("Not implemented");
}

/**
 * Exchanges a signed seed for an authentication token.
 */
export async function getToken(
  _signedSeed: string,
  _config: SiiConfig
): Promise<SiiToken> {
  // TODO: POST signed seed to SII token endpoint
  throw new Error("Not implemented");
}
