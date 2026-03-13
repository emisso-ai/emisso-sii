import type { SiiEnv } from "@emisso/sii";

/**
 * Resolve the SII environment from query params, defaulting to "production".
 */
export function resolveEnv(req: Request): SiiEnv {
  const url = new URL(req.url);
  const env = url.searchParams.get("env");
  return env === "certification" ? "certification" : "production";
}

/**
 * Parse a "YYYY-MM" period string into year and month numbers.
 */
export function parsePeriod(period: string): { year: number; month: number } {
  const [y, m] = period.split("-");
  return { year: parseInt(y!, 10), month: parseInt(m!, 10) };
}
