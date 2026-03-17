import { describe, expect, it, beforeAll } from "vitest";
import * as forge from "node-forge";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { loadCertFromFile } from "@emisso/sii";

describe("Certificate operations", () => {
  let testCertPath: string;
  const testPassword = "test-password";

  beforeAll(() => {
    // Generate a self-signed test certificate using node-forge
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = "01";
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 1);

    const attrs = [
      { shortName: "CN", value: "Test User" },
      { shortName: "O", value: "Test Org" },
      { shortName: "C", value: "CL" },
    ];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.sign(keys.privateKey, forge.md.sha256.create());

    // Create PKCS#12 (.p12) file
    const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], testPassword);
    const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
    const p12Buffer = Buffer.from(p12Der, "binary");

    testCertPath = path.join(os.tmpdir(), "test-cert.p12");
    fs.writeFileSync(testCertPath, p12Buffer);
  });

  it("loads a valid .p12 certificate", () => {
    const certData = loadCertFromFile(testCertPath, testPassword);

    expect(certData.privateKey).toBeDefined();
    expect(certData.certificate).toBeDefined();
    expect(certData.modulusB64).toBeTruthy();
    expect(certData.exponentB64).toBeTruthy();
    expect(certData.certDerB64).toBeTruthy();
  });

  it("extracts subject attributes", () => {
    const certData = loadCertFromFile(testCertPath, testPassword);
    const subject = certData.certificate.subject.attributes
      .map((a: any) => `${a.shortName}=${a.value}`)
      .join(", ");

    expect(subject).toContain("CN=Test User");
    expect(subject).toContain("O=Test Org");
    expect(subject).toContain("C=CL");
  });

  it("has valid expiry dates", () => {
    const certData = loadCertFromFile(testCertPath, testPassword);
    const now = new Date();

    expect(certData.certificate.validity.notBefore).toBeInstanceOf(Date);
    expect(certData.certificate.validity.notAfter).toBeInstanceOf(Date);
    expect(certData.certificate.validity.notAfter > now).toBe(true);
  });

  it("throws on wrong password", () => {
    expect(() => loadCertFromFile(testCertPath, "wrong-password")).toThrow();
  });

  it("throws on non-existent file", () => {
    expect(() => loadCertFromFile("/tmp/nonexistent.p12", "pass")).toThrow();
  });
});
