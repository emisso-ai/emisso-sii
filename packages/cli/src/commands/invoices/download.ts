/**
 * sii invoices download — RCV CSV export
 */

import { writeFileSync } from "node:fs";
import { Command, Options } from "@effect/cli";
import { Effect, Option as O } from "effect";
import type { IssueType, DteType, ListInvoicesParams } from "@emisso/sii";
import {
  OutputRenderer,
  CliError,
  resolveFormat,
  formatOption,
  jsonFlag,
  outputFileOption,
} from "@emisso/cli-core";
import { resolvePortalConfig, type PortalFlags, type CertFlags } from "../../config/resolve.js";

const rutOption = Options.text("rut").pipe(
  Options.optional,
  Options.withDescription("Company RUT for portal login"),
);

const claveOption = Options.text("clave").pipe(
  Options.optional,
  Options.withDescription("Clave tributaria (portal password)"),
);

const envOption = Options.text("env").pipe(
  Options.optional,
  Options.withDescription("SII environment: certification (default) or production"),
);

const periodOption = Options.text("period").pipe(
  Options.withDescription("Tax period in YYYY-MM format"),
);

const typeOption = Options.choice("type", ["issued", "received"] as const).pipe(
  Options.withDefault("received" as const),
  Options.withDescription("Invoice type: issued or received"),
);

const docTypeOption = Options.text("doc-type").pipe(
  Options.optional,
  Options.withDescription("Document type code (e.g. 33 for factura electrónica)"),
);

const headlessOption = Options.boolean("headless").pipe(
  Options.withDefault(true),
  Options.withDescription("Run browser in headless mode"),
);

const options = {
  rut: rutOption,
  clave: claveOption,
  env: envOption,
  period: periodOption,
  type: typeOption,
  docType: docTypeOption,
  headless: headlessOption,
  output: outputFileOption,
  format: formatOption,
  json: jsonFlag,
};

function parsePeriod(period: string): { year: number; month: number } {
  const match = period.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    throw new CliError({
      kind: "bad-args",
      message: `Invalid period format: ${period}`,
      detail: "Expected YYYY-MM (e.g. 2024-03)",
    });
  }
  return { year: parseInt(match[1], 10), month: parseInt(match[2], 10) };
}

export const invoicesDownloadCommand = Command.make(
  "download",
  options,
  ({ rut, clave, env, period, type, docType, headless, output, format, json }) =>
    Effect.gen(function* () {
      const renderer = yield* OutputRenderer;
      const resolvedFormat = resolveFormat(format, json);

      const flags: PortalFlags & CertFlags = {
        rut,
        clave,
        env,
        cert: O.none(),
        password: O.none(),
      };

      let portalConfig: ReturnType<typeof resolvePortalConfig>;
      try {
        portalConfig = resolvePortalConfig(flags);
      } catch (e) {
        if (e instanceof CliError) return yield* Effect.fail(e);
        throw e;
      }

      let periodParsed: { year: number; month: number };
      try {
        periodParsed = parsePeriod(period);
      } catch (e) {
        if (e instanceof CliError) return yield* Effect.fail(e);
        throw e;
      }

      const sii = yield* Effect.tryPromise({
        try: () => import("@emisso/sii"),
        catch: (error) =>
          new CliError({
            kind: "general",
            message: "Failed to load @emisso/sii",
            detail: error instanceof Error ? error.message : String(error),
          }),
      });

      const session = yield* Effect.tryPromise({
        try: () =>
          sii.portalLogin(
            { rut: portalConfig.rut, claveTributaria: portalConfig.claveTributaria, env: portalConfig.env },
            { headless },
          ),
        catch: (error) =>
          new CliError({
            kind: "auth",
            message: "Portal login failed",
            detail: error instanceof Error ? error.message : String(error),
          }),
      });

      const docTypeValue = O.getOrUndefined(docType) as DteType | undefined;

      const params: ListInvoicesParams = {
        rut: portalConfig.rut,
        issueType: type as IssueType,
        period: periodParsed,
        ...(docTypeValue ? { documentType: docTypeValue } : {}),
      };

      const csv = yield* Effect.tryPromise({
        try: () => sii.downloadRcvCsv(session, params),
        catch: (error) =>
          new CliError({
            kind: "general",
            message: "Failed to download CSV",
            detail: error instanceof Error ? error.message : String(error),
          }),
      });

      // Best-effort logout
      yield* Effect.tryPromise({
        try: () => sii.portalLogout(session),
        catch: () => new Error("logout failed"),
      }).pipe(Effect.catchAll(() => Effect.void));

      const outputPath = O.getOrUndefined(output) as string | undefined;

      if (outputPath) {
        writeFileSync(outputPath, csv + "\n", "utf-8");
        yield* renderer.render(
          [{ field: "File", value: outputPath }, { field: "Size", value: `${csv.length} bytes` }],
          { columns: [{ key: "field", label: "Field" }, { key: "value", label: "Value" }], ttyDefault: "table" },
          { format: resolvedFormat },
        );
      } else {
        yield* renderer.renderSuccess({ csv, bytes: csv.length });
      }
    }),
).pipe(Command.withDescription("Download RCV invoice data as CSV"));
