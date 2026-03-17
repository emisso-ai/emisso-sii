/**
 * sii doctor — check system health and dependency availability
 */

import { Command } from "@effect/cli";
import { Effect } from "effect";
import {
  OutputRenderer,
  resolveFormat,
  formatOption,
  jsonFlag,
} from "@emisso/cli-core";

const options = {
  format: formatOption,
  json: jsonFlag,
};

function tryImport(module: string): Effect.Effect<boolean> {
  return Effect.tryPromise({
    try: () => import(module),
    catch: () => new Error("not found"),
  }).pipe(
    Effect.map(() => true),
    Effect.catchAll(() => Effect.succeed(false)),
  );
}

export const doctorCommand = Command.make(
  "doctor",
  options,
  ({ format, json }) =>
    Effect.gen(function* () {
      const renderer = yield* OutputRenderer;
      const resolvedFormat = resolveFormat(format, json);

      const checks: Array<{ check: string; status: string; detail: string }> = [];

      // Check Node.js version
      const nodeVersion = process.version;
      const nodeMajor = parseInt(nodeVersion.slice(1), 10);
      checks.push({
        check: "Node.js",
        status: nodeMajor >= 18 ? "ok" : "warn",
        detail: `${nodeVersion} (requires >= 18)`,
      });

      // Check @emisso/sii availability
      const siiLoaded = yield* tryImport("@emisso/sii");
      checks.push({
        check: "@emisso/sii",
        status: siiLoaded ? "ok" : "error",
        detail: siiLoaded ? "Loaded successfully" : "Failed to load",
      });

      // Check playwright availability (optional, for invoice commands)
      const playwrightLoaded = yield* tryImport("playwright");
      checks.push({
        check: "Playwright (optional)",
        status: playwrightLoaded ? "ok" : "info",
        detail: playwrightLoaded
          ? "Available (required for invoice commands)"
          : "Not installed — install with: npx playwright install",
      });

      // Check node-forge (required for cert operations)
      const forgeLoaded = yield* tryImport("node-forge");
      checks.push({
        check: "node-forge",
        status: forgeLoaded ? "ok" : "error",
        detail: forgeLoaded
          ? "Available (certificate operations)"
          : "Not available — required for auth/cert commands",
      });

      yield* renderer.render(checks, {
        columns: [
          { key: "check", label: "Check", width: 25 },
          { key: "status", label: "Status", width: 8 },
          { key: "detail", label: "Detail" },
        ],
        ttyDefault: "table",
      }, { format: resolvedFormat });

      const hasError = checks.some((c) => c.status === "error");
      if (hasError) {
        process.exitCode = 1;
      }
    }),
).pipe(Command.withDescription("Check system health and dependency availability"));
