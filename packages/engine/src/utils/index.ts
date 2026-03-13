import type { SiiConfig, SiiEnv } from "../types";

/**
 * Returns the base URL for SII SOAP web services based on environment.
 */
export function getSiiBaseUrl(env: SiiEnv): string {
  return env === "production"
    ? "https://palena.sii.cl"
    : "https://maullin.sii.cl";
}

/**
 * Returns the base URL for SII portal based on environment.
 */
export function getPortalBaseUrl(env: SiiEnv): string {
  return env === "production"
    ? "https://homer.sii.cl"
    : "https://zeusr.sii.cl";
}

/**
 * Returns the auth gateway URL. Always zeusr for both cert and production.
 */
export function getPortalAuthUrl(): string {
  return "https://zeusr.sii.cl";
}

/**
 * Returns the post-login referencia URL based on environment.
 */
export function getPortalReferencia(env: SiiEnv): string {
  return env === "production"
    ? "https://misii.sii.cl/cgi_misii/siihome.cgi"
    : "https://misiir.sii.cl/cgi_misii/siihome.cgi";
}

/**
 * Splits a RUT into body and verification digit.
 * e.g. "76.123.456-7" → { rutBody: "76123456", dv: "7" }
 */
export function splitRut(rut: string): { rutBody: string; dv: string } {
  const formatted = formatRut(rut);
  const dashIndex = formatted.lastIndexOf("-");
  if (dashIndex === -1) throw new Error(`Invalid RUT format: ${rut}`);
  return {
    rutBody: formatted.substring(0, dashIndex),
    dv: formatted.substring(dashIndex + 1),
  };
}

/**
 * Formats a RUT string removing dots and ensuring dash format.
 * e.g. "76.123.456-7" → "76123456-7"
 */
export function formatRut(rut: string): string {
  return rut.replace(/\./g, "").trim();
}

/**
 * Validates a Chilean RUT check digit (modulo 11).
 */
export function validateRut(rut: string): boolean {
  const cleaned = formatRut(rut);
  const match = cleaned.match(/^(\d{1,8})-?([\dkK])$/);
  if (!match) return false;

  const body = match[1];
  const expectedDv = match[2].toUpperCase();

  let sum = 0;
  let multiplier = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i], 10) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const remainder = 11 - (sum % 11);
  const dv = remainder === 11 ? "0" : remainder === 10 ? "K" : String(remainder);

  return dv === expectedDv;
}

/**
 * Loads SII configuration from environment variables.
 */
export function loadConfigFromEnv(): SiiConfig {
  return {
    certPath: process.env.SII_CERT_PATH ?? "",
    certPassword: process.env.SII_CERT_PASSWORD ?? "",
    env: (process.env.SII_ENV as SiiEnv) ?? "certification",
  };
}
