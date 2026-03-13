import { describe, it, expect } from "vitest";
import * as forge from "node-forge";
import {
  loadCertFromBase64,
  rsaSha1Sign,
  sha1Digest,
} from "../src/cert";
import { generateTestP12 } from "./helpers/cert";

describe("cert", () => {
  const password = "testpassword";
  const p12Base64 = generateTestP12(password);

  it("loads certificate from base64", () => {
    const certData = loadCertFromBase64(p12Base64, password);
    expect(certData.privateKey).toBeDefined();
    expect(certData.certificate).toBeDefined();
    expect(certData.modulusB64).toBeTruthy();
    expect(certData.exponentB64).toBeTruthy();
    expect(certData.certDerB64).toBeTruthy();
  });

  it("modulusB64 is valid base64", () => {
    const certData = loadCertFromBase64(p12Base64, password);
    expect(() => forge.util.decode64(certData.modulusB64)).not.toThrow();
    expect(() => forge.util.decode64(certData.exponentB64)).not.toThrow();
    expect(() => forge.util.decode64(certData.certDerB64)).not.toThrow();
  });

  it("rsaSha1Sign produces verifiable signature", () => {
    const certData = loadCertFromBase64(p12Base64, password);
    const data = "test data to sign";
    const signature = rsaSha1Sign(data, certData.privateKey);
    expect(signature).toBeTruthy();
    // Verify: decode base64 sig, use public key to verify
    const md = forge.md.sha1.create();
    md.update(data, "utf8");
    const sigBytes = forge.util.decode64(signature);
    const verified = certData.certificate.publicKey.verify(
      md.digest().bytes(),
      sigBytes
    );
    expect(verified).toBe(true);
  });

  it("sha1Digest returns correct hash", () => {
    const digest = sha1Digest("hello");
    expect(digest).toBeTruthy();
    // Verify against known SHA1 of "hello"
    const md = forge.md.sha1.create();
    md.update("hello", "utf8");
    const expected = forge.util.encode64(md.digest().bytes());
    expect(digest).toBe(expected);
  });

  it("throws on wrong password", () => {
    expect(() => loadCertFromBase64(p12Base64, "wrongpassword")).toThrow();
  });
});
