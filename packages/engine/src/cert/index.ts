import * as forge from "node-forge";
import * as fs from "node:fs";

export interface CertificateData {
  privateKey: forge.pki.rsa.PrivateKey;
  certificate: forge.pki.Certificate;
  /** Base64-encoded modulus for XML-DSIG <RSAKeyValue><Modulus> */
  modulusB64: string;
  /** Base64-encoded exponent for XML-DSIG <RSAKeyValue><Exponent> */
  exponentB64: string;
  /** Base64-encoded DER certificate for XML-DSIG <X509Certificate> */
  certDerB64: string;
}

export function loadCertFromFile(
  filePath: string,
  password: string
): CertificateData {
  const buffer = fs.readFileSync(filePath);
  const base64 = buffer.toString("base64");
  return loadCertFromBase64(base64, password);
}

export function loadCertFromBase64(
  base64: string,
  password: string
): CertificateData {
  const derBytes = forge.util.decode64(base64);
  const asn1 = forge.asn1.fromDer(derBytes);
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, password);

  // Extract private key
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const keyBag =
    keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]?.key ??
    null;
  if (!keyBag) {
    throw new Error("No private key found in PKCS#12 file");
  }
  const privateKey = keyBag as forge.pki.rsa.PrivateKey;

  // Extract certificate
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBag = certBags[forge.pki.oids.certBag]?.[0]?.cert ?? null;
  if (!certBag) {
    throw new Error("No certificate found in PKCS#12 file");
  }
  const certificate = certBag;

  // Extract modulus and exponent from private key
  const modulus = (privateKey as any).n as forge.jsbn.BigInteger;
  const exponent = (privateKey as any).e as forge.jsbn.BigInteger;

  const modulusB64 = bigIntToBase64(modulus);
  const exponentB64 = bigIntToBase64(exponent);

  // DER-encode the certificate
  const certAsn1 = forge.pki.certificateToAsn1(certificate);
  const certDer = forge.asn1.toDer(certAsn1).getBytes();
  const certDerB64 = forge.util.encode64(certDer);

  return {
    privateKey,
    certificate,
    modulusB64,
    exponentB64,
    certDerB64,
  };
}

function bigIntToBase64(n: forge.jsbn.BigInteger): string {
  const hex = n.toString(16);
  const bytes = forge.util.hexToBytes(hex.length % 2 ? "0" + hex : hex);
  return forge.util.encode64(bytes);
}

export function rsaSha1Sign(
  data: string,
  privateKey: forge.pki.rsa.PrivateKey
): string {
  const md = forge.md.sha1.create();
  md.update(data, "utf8");
  const signature = privateKey.sign(md);
  return forge.util.encode64(signature);
}

export function sha1Digest(data: string): string {
  const md = forge.md.sha1.create();
  md.update(data, "utf8");
  return forge.util.encode64(md.digest().bytes());
}
