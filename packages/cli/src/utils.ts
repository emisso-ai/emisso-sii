/**
 * Shared utilities for @emisso/sii-cli
 */

import { Effect } from "effect";
import { CliError } from "@emisso/cli-core";

/**
 * Parse a YYYY-MM period string into year/month.
 * Validates format, month range (1-12), and year range (2000-2100).
 */
export function parsePeriod(period: string): { year: number; month: number } {
  const match = period.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    throw new CliError({
      kind: "bad-args",
      message: `Invalid period format: ${period}`,
      detail: "Expected YYYY-MM (e.g. 2024-03)",
    });
  }

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);

  if (month < 1 || month > 12) {
    throw new CliError({
      kind: "bad-args",
      message: `Invalid month: ${month}`,
      detail: "Month must be between 01 and 12",
    });
  }

  if (year < 2000 || year > 2100) {
    throw new CliError({
      kind: "bad-args",
      message: `Invalid year: ${year}`,
      detail: "Year must be between 2000 and 2100",
    });
  }

  return { year, month };
}

/**
 * Lift a synchronous config-resolution function into Effect,
 * catching CliError throws and converting them to Effect failures.
 */
export function effectifyConfig<T>(fn: () => T): Effect.Effect<T, CliError> {
  return Effect.try({
    try: fn,
    catch: (e) => {
      if (e instanceof CliError) return e;
      throw e;
    },
  });
}
