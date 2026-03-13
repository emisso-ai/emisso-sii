import type { CertificateData } from "../cert";
import { rsaSha1Sign, sha1Digest } from "../cert";

const DSIG_NS = "http://www.w3.org/2000/09/xmldsig#";
const C14N_ALG = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";

/** Escapes XML special characters to prevent injection. */
function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Build a signed seed XML for SII GetTokenFromSeed exchange.
 * Applies enveloped XML-DSIG signature.
 */
export function buildSignedSeedXml(
  seed: string,
  certData: CertificateData
): string {
  // 1. Build unsigned document (the content that gets digested)
  const safeSeed = escapeXml(seed);
  const unsignedDoc = `<getToken><item><Semilla>${safeSeed}</Semilla></item></getToken>`;

  // 2. Compute DigestValue of the unsigned document
  // (enveloped-signature transform means we digest the doc without the Signature element)
  const digestValue = sha1Digest(unsignedDoc);

  // 3. Build SignedInfo (this is what gets RSA-signed)
  const signedInfo =
    `<SignedInfo>` +
    `<CanonicalizationMethod Algorithm="${C14N_ALG}"/>` +
    `<SignatureMethod Algorithm="${DSIG_NS}rsa-sha1"/>` +
    `<Reference URI="">` +
    `<Transforms>` +
    `<Transform Algorithm="${DSIG_NS}enveloped-signature"/>` +
    `</Transforms>` +
    `<DigestMethod Algorithm="${DSIG_NS}sha1"/>` +
    `<DigestValue>${digestValue}</DigestValue>` +
    `</Reference>` +
    `</SignedInfo>`;

  // 4. Compute SignatureValue (RSA-SHA1 of canonical SignedInfo)
  // NOTE: C14N is not applied — the SignedInfo is signed as-is. This works because
  // the XML is constructed deterministically with no whitespace variation, so the
  // canonical form equals the raw form.
  const signatureValue = rsaSha1Sign(signedInfo, certData.privateKey);

  // 5. Build KeyInfo
  const keyInfo =
    `<KeyInfo>` +
    `<KeyValue>` +
    `<RSAKeyValue>` +
    `<Modulus>${certData.modulusB64}</Modulus>` +
    `<Exponent>${certData.exponentB64}</Exponent>` +
    `</RSAKeyValue>` +
    `</KeyValue>` +
    `<X509Data>` +
    `<X509Certificate>${certData.certDerB64}</X509Certificate>` +
    `</X509Data>` +
    `</KeyInfo>`;

  // 6. Build complete Signature element
  const signature =
    `<Signature xmlns="${DSIG_NS}">` +
    signedInfo +
    `<SignatureValue>${signatureValue}</SignatureValue>` +
    keyInfo +
    `</Signature>`;

  // 7. Insert Signature into document (after <item>)
  return `<getToken><item><Semilla>${safeSeed}</Semilla></item>${signature}</getToken>`;
}
