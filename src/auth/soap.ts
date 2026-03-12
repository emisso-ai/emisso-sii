import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: false,
  parseTagValue: false,
});

/**
 * Build SOAP envelope for CrSeed (get seed) request.
 */
export function buildCrSeedSoapEnvelope(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soapenv:Header/>` +
    `<soapenv:Body>` +
    `<getCrSeed/>` +
    `</soapenv:Body>` +
    `</soapenv:Envelope>`
  );
}

/**
 * Build SOAP envelope for GetTokenFromSeed request.
 */
export function buildGetTokenSoapEnvelope(signedSeedXml: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soapenv:Header/>` +
    `<soapenv:Body>` +
    `<getTokenFromSeed>` +
    `<pszXml><![CDATA[${signedSeedXml}]]></pszXml>` +
    `</getTokenFromSeed>` +
    `</soapenv:Body>` +
    `</soapenv:Envelope>`
  );
}

/**
 * Extract the RESPUESTA element from a parsed SII SOAP response,
 * navigating through possible SOAP envelope wrappers.
 */
function extractRespuesta(
  parsed: Record<string, any>,
  operation: string
): Record<string, any> {
  return (
    parsed?.Envelope?.Body?.[`${operation}Response`]?.return?.RESPUESTA ??
    parsed?.RESPUESTA ??
    parsed
  );
}

/**
 * Validate ESTADO in a SII response. Throws if not "00".
 */
function assertEstadoOk(
  respuesta: Record<string, any>,
  context: string
): string {
  const estado = String(respuesta?.RESP_HDR?.ESTADO ?? "");
  if (estado !== "00") {
    const glosa = respuesta?.RESP_HDR?.GLOSA ?? "Unknown error";
    throw new Error(`SII ${context} failed with state ${estado}: ${glosa}`);
  }
  return estado;
}

/**
 * Parse seed value from SII CrSeed SOAP response.
 * Expects <RESPUESTA><RESP_HDR><ESTADO>00</ESTADO></RESP_HDR><RESP_BODY><SEMILLA>value</SEMILLA></RESP_BODY></RESPUESTA>
 */
export function parseSeedFromResponse(responseXml: string): string {
  const parsed = parser.parse(responseXml);
  const respuesta = extractRespuesta(parsed, "getCrSeed");
  assertEstadoOk(respuesta, "CrSeed");

  const semilla = respuesta?.RESP_BODY?.SEMILLA;
  if (!semilla) {
    throw new Error("Could not extract seed from SII response");
  }

  return String(semilla);
}

/**
 * Parse token from SII GetTokenFromSeed SOAP response.
 */
export function parseTokenFromResponse(responseXml: string): {
  token: string;
  state: string;
} {
  const parsed = parser.parse(responseXml);
  const respuesta = extractRespuesta(parsed, "getTokenFromSeed");
  const estado = assertEstadoOk(respuesta, "GetTokenFromSeed");

  const token = respuesta?.RESP_BODY?.TOKEN;
  if (!token) {
    throw new Error("Could not extract token from SII response");
  }

  return { token: String(token), state: estado };
}
