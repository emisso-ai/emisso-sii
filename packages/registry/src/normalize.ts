/**
 * Normalization helpers shared by every source adapter and the merger.
 */

// ============================================================================
// RUT
// ============================================================================

/**
 * Canonicalize a Chilean RUT to "NNNNNNNN-D" (digits + hyphen + verifier, upper).
 *
 * Accepts:
 *   - "76.543.210-K"
 *   - "76543210-K"
 *   - "76543210K"
 *   - "765432109" (last char is verifier digit)
 *
 * Rejects RUTs that fail the modulo-11 check.
 */
export function canonicalizeRut(input: string): string {
  if (!input) throw new Error("RUT is empty");
  const cleaned = input.replace(/[.\s]/g, "").toUpperCase();
  const match = cleaned.match(/^(\d{1,8})-?([0-9K])$/);
  if (!match) throw new Error(`Invalid RUT format: ${input}`);
  const body = match[1];
  const verifier = match[2];
  const expected = computeRutVerifier(body);
  if (expected !== verifier) {
    throw new Error(`RUT check digit mismatch: ${input} (expected ${expected})`);
  }
  return `${body}-${verifier}`;
}

/** Returns true if the RUT canonicalizes successfully. */
export function isValidRut(input: string): boolean {
  try {
    canonicalizeRut(input);
    return true;
  } catch {
    return false;
  }
}

/** Compute the SII modulo-11 verifier digit for a RUT body. */
export function computeRutVerifier(body: string): string {
  let sum = 0;
  let factor = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const remainder = 11 - (sum % 11);
  if (remainder === 11) return "0";
  if (remainder === 10) return "K";
  return String(remainder);
}

// ============================================================================
// TEXT
// ============================================================================

/** Title-case Chilean place names ("LAS CONDES" → "Las Condes"). */
export function titleCaseEs(input: string | undefined): string | undefined {
  if (!input) return undefined;
  return input
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join(" ")
    .trim();
}

/** Strip extra whitespace, normalize accents-preserving. */
export function cleanText(input: string | undefined): string | undefined {
  if (input === undefined) return undefined;
  const trimmed = input.replace(/\s+/g, " ").trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

// ============================================================================
// SIZE TIERS
// ============================================================================

import type { SizeTier } from "./types";

/**
 * Map an SII tramo string ("1.1" .. "5.4") to a size tier.
 * Returns undefined for unknown values so callers can decide on a fallback.
 */
export function tramoToSizeTier(tramo: string | undefined): SizeTier | undefined {
  if (!tramo) return undefined;
  const family = tramo.split(".")[0];
  switch (family) {
    case "0":
    case "1":
      return "micro";
    case "2":
      return "pequeña";
    case "3":
      return "mediana";
    case "4":
    case "5":
      return "grande";
    default:
      return undefined;
  }
}

/** Map approximate headcount to a size tier (used when tramo is unknown). */
export function headcountToSizeTier(headcount: number | undefined): SizeTier | undefined {
  if (headcount === undefined || headcount < 0) return undefined;
  if (headcount < 10) return "micro";
  if (headcount < 50) return "pequeña";
  if (headcount < 200) return "mediana";
  return "grande";
}

const TIER_RANK: Record<SizeTier, number> = {
  micro: 0,
  pequeña: 1,
  mediana: 2,
  grande: 3,
};

export function sizeTierAtLeast(tier: SizeTier | undefined, minimum: SizeTier): boolean {
  if (!tier) return false;
  return TIER_RANK[tier] >= TIER_RANK[minimum];
}

export function sizeTierAtMost(tier: SizeTier | undefined, maximum: SizeTier): boolean {
  if (!tier) return false;
  return TIER_RANK[tier] <= TIER_RANK[maximum];
}

// ============================================================================
// FINGERPRINTING
// ============================================================================

/**
 * Stable hash for change detection in source-hit fingerprints. Recursively
 * serializes the payload with sorted keys so that `{a:1,b:2}` and `{b:2,a:1}`
 * produce the same hash.
 */
export function fingerprint(payload: unknown): string {
  return fnv1a(stableStringify(payload));
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
