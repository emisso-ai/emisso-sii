import * as forge from "node-forge";
import type { DteType, FolioRange } from "../../src/types";

export interface TestCaf {
  /** Full CAF file XML (AUTORIZACION > CAF + RSASK + RSAPUBK). */
  cafXml: string;
  privateKeyPem: string;
  publicKeyPem: string;
  publicKey: forge.pki.rsa.PublicKey;
  /** FolioRange ready to pass to applyTimbre. */
  folioRange: FolioRange;
}

/**
 * Generates a synthetic CAF (folio authorization) for testing.
 *
 * Mirrors the structure the SII emits: AUTORIZACION > CAF (DA + FRMA) +
 * RSASK/RSAPUBK. The inner FRMA is normally the SII's signature over DA;
 * here it is self-signed with the same test key — applyTimbre must embed it
 * verbatim either way, which is what tests assert.
 */
export function generateTestCaf(
  options: {
    tipoDte?: DteType;
    rangoDesde?: number;
    rangoHasta?: number;
    rutEmisor?: string;
  } = {}
): TestCaf {
  const {
    tipoDte = "39",
    rangoDesde = 1,
    rangoHasta = 100,
    rutEmisor = "76123456-7",
  } = options;

  // Real CAF keys are 1024-bit RSA.
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey);
  const publicKeyPem = forge.pki.publicKeyToPem(keys.publicKey);

  const modulusB64 = bigIntToBase64(keys.publicKey.n as forge.jsbn.BigInteger);
  const exponentB64 = bigIntToBase64(keys.publicKey.e as forge.jsbn.BigInteger);

  const da =
    `<DA>` +
    `<RE>${rutEmisor}</RE>` +
    `<RS>EMPRESA TEST SPA</RS>` +
    `<TD>${tipoDte}</TD>` +
    `<RNG><D>${rangoDesde}</D><H>${rangoHasta}</H></RNG>` +
    `<FA>2026-01-01</FA>` +
    `<RSAPK><M>${modulusB64}</M><E>${exponentB64}</E></RSAPK>` +
    `<IDK>100</IDK>` +
    `</DA>`;

  const md = forge.md.sha1.create();
  md.update(da, "utf8");
  const frma = forge.util.encode64(keys.privateKey.sign(md));

  const cafXml =
    `<AUTORIZACION>` +
    `<CAF version="1.0">${da}<FRMA algoritmo="SHA1withRSA">${frma}</FRMA></CAF>` +
    `<RSASK>${privateKeyPem}</RSASK>` +
    `<RSAPUBK>${publicKeyPem}</RSAPUBK>` +
    `</AUTORIZACION>`;

  return {
    cafXml,
    privateKeyPem,
    publicKeyPem,
    publicKey: keys.publicKey,
    folioRange: {
      tipoDte,
      rangoDesde,
      rangoHasta,
      fechaAutorizacion: "2026-01-01",
      privateKey: privateKeyPem,
      publicKey: publicKeyPem,
      cafXml,
    },
  };
}

function bigIntToBase64(n: forge.jsbn.BigInteger): string {
  const hex = n.toString(16);
  let bytes = forge.util.hexToBytes(hex.length % 2 ? "0" + hex : hex);
  if (bytes.charCodeAt(0) >= 0x80) bytes = "\x00" + bytes;
  return forge.util.encode64(bytes);
}
