/**
 * sii invoices list — RCV invoice listing (portal session required)
 */

import { Command, Options } from "@effect/cli";
import { Effect, Option as O } from "effect";
import {
  portalLogin,
  portalLogout,
  listInvoices,
  DteTypeSchema,
} from "@emisso/sii";
import type { IssueType, DteType, ListInvoicesParams, Invoice } from "@emisso/sii";
import {
  OutputRenderer,
  CliError,
  resolveFormat,
  formatOption,
  jsonFlag,
} from "@emisso/cli-core";
import { invoiceColumns } from "../../formatters/sii-table.js";
import { resolvePortalConfig, type PortalFlags, type CertFlags } from "../../config/resolve.js";
import { rutOption, claveOption, envOption } from "../../options.js";
import { parsePeriod, effectifyConfig } from "../../utils.js";

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
  format: formatOption,
  json: jsonFlag,
};

function invoiceToRow(inv: Invoice): Record<string, string> {
  return {
    number: String(inv.number),
    documentType: inv.documentType,
    date: inv.date,
    issuerRut: inv.issuer.rut,
    issuerName: inv.issuer.name,
    receiverRut: inv.receiver.rut,
    receiverName: inv.receiver.name,
    netAmount: inv.netAmount.toLocaleString("es-CL"),
    vatAmount: inv.vatAmount.toLocaleString("es-CL"),
    totalAmount: inv.totalAmount.toLocaleString("es-CL"),
  };
}

export const invoicesListCommand = Command.make(
  "list",
  options,
  ({ rut, clave, env, period, type, docType, headless, format, json }) =>
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

      const portalConfig = yield* effectifyConfig(() => resolvePortalConfig(flags));
      const periodParsed = yield* effectifyConfig(() => parsePeriod(period));

      const docTypeValue = O.getOrUndefined(docType);
      if (docTypeValue !== undefined) {
        const parsed = DteTypeSchema.safeParse(docTypeValue);
        if (!parsed.success) {
          return yield* Effect.fail(new CliError({
            kind: "bad-args",
            message: `Invalid document type: ${docTypeValue}`,
            detail: "Valid types: 33, 34, 39, 41, 43, 46, 52, 56, 61, 110, 112",
          }));
        }
      }

      const session = yield* Effect.tryPromise({
        try: () =>
          portalLogin(
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

      const params: ListInvoicesParams = {
        rut: portalConfig.rut,
        issueType: type as IssueType,
        period: periodParsed,
        ...(docTypeValue ? { documentType: docTypeValue as DteType } : {}),
      };

      const invoices = yield* Effect.tryPromise({
        try: () => listInvoices(session, params),
        catch: (error) =>
          new CliError({
            kind: "general",
            message: "Failed to list invoices",
            detail: error instanceof Error ? error.message : String(error),
          }),
      }).pipe(
        Effect.ensuring(
          Effect.tryPromise({ try: () => portalLogout(session), catch: () => {} })
            .pipe(Effect.catchAll(() => Effect.void))
        )
      );

      const rows = invoices.map(invoiceToRow);

      yield* renderer.render(rows, {
        columns: invoiceColumns,
        ttyDefault: "table",
      }, { format: resolvedFormat });
    }),
).pipe(Command.withDescription("List invoices from SII RCV (Registro de Compras y Ventas)"));
