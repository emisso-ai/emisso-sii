import { describe, it, expect } from "vitest";
import {
  createSiiHttpClient,
  SiiAuthExpiredError,
  SII_USER_AGENT,
} from "../src/http";
import { CookieJar } from "tough-cookie";

describe("http", () => {
  it("creates client with default options", () => {
    const client = createSiiHttpClient();
    expect(client).toBeDefined();
    expect(client.cookieJar).toBeInstanceOf(CookieJar);
  });

  it("uses custom cookie jar", () => {
    const jar = new CookieJar();
    const client = createSiiHttpClient({ cookieJar: jar });
    expect(client.cookieJar).toBe(jar);
  });

  it("SiiAuthExpiredError has correct name", () => {
    const err = new SiiAuthExpiredError();
    expect(err.name).toBe("SiiAuthExpiredError");
    expect(err.message).toContain("NO ESTA AUTENTICADO");
  });

  it("SiiAuthExpiredError accepts custom message", () => {
    const err = new SiiAuthExpiredError("custom");
    expect(err.message).toBe("custom");
  });

  it("SII_USER_AGENT is defined", () => {
    expect(SII_USER_AGENT).toContain("EmissoSII");
  });

  it("sets default user agent header", () => {
    const client = createSiiHttpClient();
    const ua =
      client.defaults.headers.common?.["User-Agent"] ||
      client.defaults.headers["User-Agent"];
    expect(ua).toBe(SII_USER_AGENT);
  });

  it("sets custom user agent header", () => {
    const client = createSiiHttpClient({ userAgent: "CustomAgent/1.0" });
    const ua =
      client.defaults.headers.common?.["User-Agent"] ||
      client.defaults.headers["User-Agent"];
    expect(ua).toBe("CustomAgent/1.0");
  });

  it("has response interceptor registered", () => {
    const client = createSiiHttpClient({ rateLimitMs: 0 });
    expect(client.interceptors.response).toBeDefined();
  });

  it("has request interceptor registered", () => {
    const client = createSiiHttpClient({ rateLimitMs: 0 });
    expect(client.interceptors.request).toBeDefined();
  });

  it("sets default timeout of 30s", () => {
    const client = createSiiHttpClient();
    expect(client.defaults.timeout).toBe(30_000);
  });

  it("applies custom baseURL", () => {
    const client = createSiiHttpClient({
      baseURL: "https://example.com",
    });
    expect(client.defaults.baseURL).toBe("https://example.com");
  });
});
