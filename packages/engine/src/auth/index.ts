import type { SiiConfig } from "../types";
import { loadCertFromFile, type CertificateData } from "../cert";
import { createSiiHttpClient } from "../http";
import { getSiiBaseUrl } from "../utils";
import { buildSignedSeedXml } from "./xml-dsig";
import {
  buildCrSeedSoapEnvelope,
  buildGetTokenSoapEnvelope,
  parseSeedFromResponse,
  parseTokenFromResponse,
} from "./soap";

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
export async function authenticate(config: SiiConfig): Promise<SiiToken> {
  const client = createSiiHttpClient({ rateLimitMs: 0 });
  const seed = await getSeed(config, client);
  const signedSeed = signSeed(seed, config.certPath, config.certPassword);
  return getToken(signedSeed, config, client);
}

/**
 * Retrieves the authentication seed from SII.
 */
export async function getSeed(
  config: SiiConfig,
  client?: ReturnType<typeof createSiiHttpClient>
): Promise<string> {
  const http = client ?? createSiiHttpClient({ rateLimitMs: 0 });
  const baseUrl = getSiiBaseUrl(config.env);
  const soapEnvelope = buildCrSeedSoapEnvelope();
  const response = await http.post(
    `${baseUrl}/DTEWS/CrSeed.jws`,
    soapEnvelope,
    { headers: { "Content-Type": "text/xml; charset=utf-8" } }
  );
  return parseSeedFromResponse(response.data);
}

/**
 * Signs the seed XML using the digital certificate.
 */
export function signSeed(
  seed: string,
  certPath: string,
  certPassword: string
): string {
  const certData = loadCertFromFile(certPath, certPassword);
  return buildSignedSeedXml(seed, certData);
}

/**
 * Signs the seed XML using pre-loaded certificate data.
 * Use this when the certificate is already in memory (e.g., loaded from base64).
 */
export function signSeedFromCertData(seed: string, certData: CertificateData): string {
  return buildSignedSeedXml(seed, certData);
}

/**
 * Exchanges a signed seed for an authentication token.
 */
export async function getToken(
  signedSeed: string,
  config: SiiConfig,
  client?: ReturnType<typeof createSiiHttpClient>
): Promise<SiiToken> {
  const http = client ?? createSiiHttpClient({ rateLimitMs: 0 });
  const baseUrl = getSiiBaseUrl(config.env);
  const soapEnvelope = buildGetTokenSoapEnvelope(signedSeed);
  const response = await http.post(
    `${baseUrl}/DTEWS/GetTokenFromSeed.jws`,
    soapEnvelope,
    { headers: { "Content-Type": "text/xml; charset=utf-8" } }
  );
  const { token } = parseTokenFromResponse(response.data);
  return {
    token,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000), // SII tokens expire in ~30 min
  };
}
