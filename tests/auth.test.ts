import { describe, it, expect } from "vitest";
import { buildSignedSeedXml } from "../src/auth/xml-dsig";
import {
  buildCrSeedSoapEnvelope,
  buildGetTokenSoapEnvelope,
  parseSeedFromResponse,
  parseTokenFromResponse,
} from "../src/auth/soap";
import { loadCertFromBase64 } from "../src/cert";
import { generateTestP12 } from "./helpers/cert";

describe("soap", () => {
  it("builds CrSeed SOAP envelope", () => {
    const envelope = buildCrSeedSoapEnvelope();
    expect(envelope).toContain("soapenv:Envelope");
    expect(envelope).toContain("soapenv:Body");
    expect(envelope).toContain("getCrSeed");
  });

  it("builds GetToken SOAP envelope with signed XML", () => {
    const envelope = buildGetTokenSoapEnvelope(
      "<getToken><Semilla>123</Semilla></getToken>"
    );
    expect(envelope).toContain("soapenv:Envelope");
    expect(envelope).toContain("getTokenFromSeed");
    expect(envelope).toContain("pszXml");
    expect(envelope).toContain("CDATA");
  });

  it("parses seed from SII response", () => {
    const xml = `<SII:RESPUESTA><SII:RESP_HDR><ESTADO>00</ESTADO></SII:RESP_HDR><SII:RESP_BODY><SEMILLA>012345</SEMILLA></SII:RESP_BODY></SII:RESPUESTA>`;
    const seed = parseSeedFromResponse(xml);
    expect(seed).toBe("012345");
  });

  it("parses token from SII response", () => {
    const xml = `<SII:RESPUESTA><SII:RESP_HDR><ESTADO>00</ESTADO></SII:RESP_HDR><SII:RESP_BODY><TOKEN>ABCDEFGH</TOKEN></SII:RESP_BODY></SII:RESPUESTA>`;
    const { token, state } = parseTokenFromResponse(xml);
    expect(token).toBe("ABCDEFGH");
    expect(state).toBe("00");
  });

  it("throws on error state in seed response", () => {
    const xml = `<SII:RESPUESTA><SII:RESP_HDR><ESTADO>-1</ESTADO><GLOSA>Error</GLOSA></SII:RESP_HDR></SII:RESPUESTA>`;
    expect(() => parseSeedFromResponse(xml)).toThrow();
  });

  it("throws on error state in token response", () => {
    const xml = `<SII:RESPUESTA><SII:RESP_HDR><ESTADO>-1</ESTADO><GLOSA>Auth failed</GLOSA></SII:RESP_HDR></SII:RESPUESTA>`;
    expect(() => parseTokenFromResponse(xml)).toThrow();
  });
});

describe("xml-dsig", () => {
  const password = "test123";
  const p12 = generateTestP12(password);

  it("builds signed seed XML with correct structure", () => {
    const certData = loadCertFromBase64(p12, password);
    const xml = buildSignedSeedXml("012345", certData);
    expect(xml).toContain("<getToken>");
    expect(xml).toContain("<Semilla>012345</Semilla>");
    expect(xml).toContain("<Signature");
    expect(xml).toContain("http://www.w3.org/2000/09/xmldsig#");
    expect(xml).toContain("<SignedInfo");
    expect(xml).toContain("<SignatureValue>");
    expect(xml).toContain("<DigestValue>");
    expect(xml).toContain("<RSAKeyValue>");
    expect(xml).toContain("<Modulus>");
    expect(xml).toContain("<Exponent>");
    expect(xml).toContain("<X509Certificate>");
  });

  it("includes cert data in KeyInfo", () => {
    const certData = loadCertFromBase64(p12, password);
    const xml = buildSignedSeedXml("012345", certData);
    expect(xml).toContain(certData.modulusB64);
    expect(xml).toContain(certData.exponentB64);
    expect(xml).toContain(certData.certDerB64);
  });

  it("produces different signatures for different seeds", () => {
    const certData = loadCertFromBase64(p12, password);
    const xml1 = buildSignedSeedXml("111111", certData);
    const xml2 = buildSignedSeedXml("222222", certData);
    // Extract SignatureValue
    const sig1 = xml1.match(/<SignatureValue>(.+?)<\/SignatureValue>/)?.[1];
    const sig2 = xml2.match(/<SignatureValue>(.+?)<\/SignatureValue>/)?.[1];
    expect(sig1).not.toBe(sig2);
  });
});

describe.skipIf(!process.env.SII_CERT_PATH)(
  "integration: SII SOAP auth",
  () => {
    it("authenticates against maullin (certification)", async () => {
      const { authenticate } = await import("../src/auth");
      const token = await authenticate({
        certPath: process.env.SII_CERT_PATH!,
        certPassword: process.env.SII_CERT_PASSWORD!,
        env: "certification",
      });
      expect(token.token).toBeTruthy();
      expect(token.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  }
);
