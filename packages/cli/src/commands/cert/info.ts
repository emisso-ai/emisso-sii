/**
 * sii cert info — show certificate subject, issuer, expiry
 */

import { Command, Options } from "@effect/cli";
import { Effect } from "effect";
import { loadCertFromFile } from "@emisso/sii";
import {
  OutputRenderer,
  CliError,
  resolveFormat,
  formatOption,
  jsonFlag,
} from "@emisso/cli-core";
import { certColumns } from "../../formatters/sii-table.js";
import { resolveCertConfig, type CertFlags } from "../../config/resolve.js";

const certOption = Options.text("cert").pipe(
  Options.optional,
  Options.withDescription("Path to .p12 certificate file"),
);

const passwordOption = Options.text("password").pipe(
  Options.optional,
  Options.withDescription("Certificate password"),
);

const options = {
  cert: certOption,
  password: passwordOption,
  format: formatOption,
  json: jsonFlag,
};

export const certInfoCommand = Command.make(
  "info",
  options,
  ({ cert, password, format, json }) =>
    Effect.gen(function* () {
      const renderer = yield* OutputRenderer;
      const resolvedFormat = resolveFormat(format, json);

      const flags: CertFlags = {
        cert,
        password,
        env: { _tag: "None" } as any,
      };

      let config: ReturnType<typeof resolveCertConfig>;
      try {
        config = resolveCertConfig(flags);
      } catch (e) {
        if (e instanceof CliError) return yield* Effect.fail(e);
        throw e;
      }

      const certData = yield* Effect.try({
        try: () => loadCertFromFile(config.certPath, config.certPassword),
        catch: (error) =>
          new CliError({
            kind: "auth",
            message: "Failed to load certificate",
            detail: error instanceof Error ? error.message : String(error),
          }),
      });

      const certificate = certData.certificate;
      const subject = certificate.subject.attributes
        .map((a: any) => `${a.shortName}=${a.value}`)
        .join(", ");
      const issuer = certificate.issuer.attributes
        .map((a: any) => `${a.shortName}=${a.value}`)
        .join(", ");
      const validFrom = certificate.validity.notBefore.toISOString();
      const validTo = certificate.validity.notAfter.toISOString();
      const now = new Date();
      const isExpired = now > certificate.validity.notAfter;
      const serialNumber = certificate.serialNumber;

      const rows = [
        { field: "Subject", value: subject },
        { field: "Issuer", value: issuer },
        { field: "Serial Number", value: serialNumber },
        { field: "Valid From", value: validFrom },
        { field: "Valid To", value: validTo },
        { field: "Status", value: isExpired ? "EXPIRED" : "Valid" },
      ];

      yield* renderer.render(rows, {
        columns: certColumns,
        ttyDefault: "table",
      }, { format: resolvedFormat });

      if (isExpired) {
        process.exitCode = 1;
      }
    }),
).pipe(Command.withDescription("Show certificate subject, issuer, and expiry dates"));
