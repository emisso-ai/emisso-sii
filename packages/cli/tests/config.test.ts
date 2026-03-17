import { describe, expect, it, afterEach, vi } from "vitest";
import { Option } from "effect";
import { resolveCertConfig, resolvePortalConfig } from "../src/config/resolve";

describe("resolveCertConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("resolves from CLI flags", () => {
    const config = resolveCertConfig({
      cert: Option.some("/path/to/cert.p12"),
      password: Option.some("secret"),
      env: Option.some("production"),
    });

    expect(config.certPath).toBe("/path/to/cert.p12");
    expect(config.certPassword).toBe("secret");
    expect(config.env).toBe("production");
  });

  it("falls back to env vars when flags are None", () => {
    vi.stubEnv("SII_CERT_PATH", "/env/cert.p12");
    vi.stubEnv("SII_CERT_PASSWORD", "env-secret");
    vi.stubEnv("SII_ENV", "production");

    const config = resolveCertConfig({
      cert: Option.none(),
      password: Option.none(),
      env: Option.none(),
    });

    expect(config.certPath).toBe("/env/cert.p12");
    expect(config.certPassword).toBe("env-secret");
    expect(config.env).toBe("production");
  });

  it("CLI flags take precedence over env vars", () => {
    vi.stubEnv("SII_CERT_PATH", "/env/cert.p12");
    vi.stubEnv("SII_CERT_PASSWORD", "env-secret");

    const config = resolveCertConfig({
      cert: Option.some("/flag/cert.p12"),
      password: Option.some("flag-secret"),
      env: Option.none(),
    });

    expect(config.certPath).toBe("/flag/cert.p12");
    expect(config.certPassword).toBe("flag-secret");
  });

  it("defaults env to certification", () => {
    const config = resolveCertConfig({
      cert: Option.some("/path/cert.p12"),
      password: Option.some("secret"),
      env: Option.none(),
    });

    expect(config.env).toBe("certification");
  });

  it("throws on missing cert path", () => {
    delete process.env.SII_CERT_PATH;

    expect(() =>
      resolveCertConfig({
        cert: Option.none(),
        password: Option.some("secret"),
        env: Option.none(),
      }),
    ).toThrow("Missing required option: --cert");
  });

  it("throws on missing password", () => {
    delete process.env.SII_CERT_PASSWORD;

    expect(() =>
      resolveCertConfig({
        cert: Option.some("/path/cert.p12"),
        password: Option.none(),
        env: Option.none(),
      }),
    ).toThrow("Missing required option: --password");
  });

  it("throws on invalid env value", () => {
    expect(() =>
      resolveCertConfig({
        cert: Option.some("/path/cert.p12"),
        password: Option.some("secret"),
        env: Option.some("staging"),
      }),
    ).toThrow("Invalid environment: staging");
  });

  it("trims whitespace from flag values", () => {
    const config = resolveCertConfig({
      cert: Option.some("  /path/cert.p12  "),
      password: Option.some("  secret  "),
      env: Option.none(),
    });

    expect(config.certPath).toBe("/path/cert.p12");
    expect(config.certPassword).toBe("secret");
  });

  it("rejects whitespace-only flag values and falls back to env", () => {
    vi.stubEnv("SII_CERT_PATH", "/env/cert.p12");

    const config = resolveCertConfig({
      cert: Option.some("   "),
      password: Option.some("secret"),
      env: Option.none(),
    });

    expect(config.certPath).toBe("/env/cert.p12");
  });

  it("rejects whitespace-only env values", () => {
    vi.stubEnv("SII_CERT_PATH", "   ");
    delete process.env.SII_CERT_PASSWORD;

    expect(() =>
      resolveCertConfig({
        cert: Option.none(),
        password: Option.some("secret"),
        env: Option.none(),
      }),
    ).toThrow("Missing required option: --cert");
  });
});

describe("resolvePortalConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("resolves from CLI flags", () => {
    const config = resolvePortalConfig({
      rut: Option.some("76123456-7"),
      clave: Option.some("mypassword"),
      env: Option.some("certification"),
      cert: Option.none(),
      password: Option.none(),
    });

    expect(config.rut).toBe("76123456-7");
    expect(config.claveTributaria).toBe("mypassword");
    expect(config.env).toBe("certification");
  });

  it("falls back to env vars", () => {
    vi.stubEnv("SII_RUT", "76123456-7");
    vi.stubEnv("SII_CLAVE", "envpass");

    const config = resolvePortalConfig({
      rut: Option.none(),
      clave: Option.none(),
      env: Option.none(),
      cert: Option.none(),
      password: Option.none(),
    });

    expect(config.rut).toBe("76123456-7");
    expect(config.claveTributaria).toBe("envpass");
  });

  it("throws on missing rut", () => {
    delete process.env.SII_RUT;

    expect(() =>
      resolvePortalConfig({
        rut: Option.none(),
        clave: Option.some("pass"),
        env: Option.none(),
        cert: Option.none(),
        password: Option.none(),
      }),
    ).toThrow("Missing required option: --rut");
  });
});
